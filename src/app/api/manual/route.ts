import { services } from "@config/limits.config";
import { deleteManual, readManual, upsertManual } from "@/lib/manual";
import { meter } from "@/lib/metering";

export const dynamic = "force-dynamic";

export async function GET() {
  meter("api/manual");
  return Response.json(await readManual());
}

function bad(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

/** POST /api/manual: add or replace one manual value. */
export async function POST(req: Request) {
  meter("api/manual");
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("JSON verwacht.");

  const service = String(body.service ?? "");
  const metric = String(body.metric ?? "").trim();
  const unit = String(body.unit ?? "").trim();
  const used = Number(body.used);
  const limit = body.limit === "" || body.limit == null ? null : Number(body.limit);
  const resetsAt = body.resetsAt ? new Date(String(body.resetsAt)) : undefined;

  if (!services[service]) return bad(`Onbekende dienst "${service}".`);
  if (!metric || metric.length > 80) return bad("Naam is verplicht (max. 80 tekens).");
  if (unit.length > 20) return bad("Eenheid is te lang (max. 20 tekens).");
  if (!Number.isFinite(used) || used < 0) return bad("Gebruikt moet een getal ≥ 0 zijn.");
  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) return bad("Limiet moet een getal > 0 zijn, of leeg.");
  if (resetsAt && Number.isNaN(resetsAt.getTime())) return bad("Resetdatum is geen geldige datum.");

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
  meter("api/manual");
  const url = new URL(req.url);
  const service = url.searchParams.get("service");
  const metric = url.searchParams.get("metric");
  if (!service || !metric) return bad("service and metric are required.");
  await deleteManual(service, metric);
  return Response.json({ ok: true });
}
