import { services } from "@config/limits.config";
import { deleteManual, readManual, upsertManual } from "@/lib/manual";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await readManual());
}

function bad(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

/** POST /api/manual: add or replace one manual value. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Expected a JSON body.");

  const service = String(body.service ?? "");
  const metric = String(body.metric ?? "").trim();
  const unit = String(body.unit ?? "").trim();
  const used = Number(body.used);
  const limit = body.limit === "" || body.limit == null ? null : Number(body.limit);
  const resetsAt = body.resetsAt ? new Date(String(body.resetsAt)) : undefined;

  if (!services[service]) return bad(`Unknown service "${service}".`);
  if (!metric || metric.length > 80) return bad("Metric name is required (max 80 characters).");
  if (unit.length > 20) return bad("Unit is too long (max 20 characters).");
  if (!Number.isFinite(used) || used < 0) return bad("Used must be a number ≥ 0.");
  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) return bad("Limit must be a number > 0, or empty.");
  if (resetsAt && Number.isNaN(resetsAt.getTime())) return bad("Reset date is not a valid date.");

  await upsertManual({
    service,
    metric,
    used,
    limit,
    unit,
    resetsAt: resetsAt?.toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return Response.json({ ok: true });
}

/** DELETE /api/manual?service=x&metric=y */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const service = url.searchParams.get("service");
  const metric = url.searchParams.get("metric");
  if (!service || !metric) return bad("service and metric are required.");
  await deleteManual(service, metric);
  return Response.json({ ok: true });
}
