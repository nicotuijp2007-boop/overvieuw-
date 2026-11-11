import { withDb } from "@/lib/db";
import { safeEqual } from "@/lib/secrets";

export const dynamic = "force-dynamic";

/**
 * POST /api/ingest/claude: receives Claude data from scripts/sync-claude.mjs.
 * Authenticated with `Authorization: Bearer <INGEST_SECRET>` (not the dashboard password).
 */
const MAX_ROWS = 5000;

const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000 ? v : null);

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return bad("INGEST_SECRET is not set on the server.", 503);
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return bad("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  const machine = str(body?.machine, 100)?.trim();
  if (!machine) return bad("machine is required (max 100 characters).");
  if (body.usage != null && !Array.isArray(body.usage)) return bad("usage must be an array.");
  const usageIn: unknown[] = body.usage ?? [];
  if (usageIn.length > MAX_ROWS) return bad(`usage has more than ${MAX_ROWS} rows.`);

  const rows: Record<string, string | number | string[]>[] = [];
  for (const [i, r] of usageIn.entries()) {
    const x = r as Record<string, unknown>;
    const row = {
      machine,
      session_id: str(x.sessionId, 200),
      day: typeof x.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.day) ? x.day : null,
      project: str(x.project ?? "", 200),
      models: Array.isArray(x.models) && x.models.length <= 20 && x.models.every((m) => str(m, 100)) ? (x.models as string[]) : null,
      input: count(x.input),
      output: count(x.output),
      cache_write: count(x.cacheWrite),
      cache_read: count(x.cacheRead),
      responses: count(x.responses),
      first_at: iso(x.firstAt),
      last_at: iso(x.lastAt),
    };
    if (Object.values(row).some((v) => v === null)) return bad(`usage[${i}] is invalid.`);
    rows.push(row as Record<string, string | number | string[]>);
  }

  const rl = body.rateLimits as Record<string, any> | null | undefined;
  const rate = rl
    ? {
        recorded_at: iso(rl.recordedAt),
        five_hour_pct: rl.fiveHour ? pct(rl.fiveHour.pct) : null,
        five_hour_resets_at: rl.fiveHour?.resetsAt ? iso(rl.fiveHour.resetsAt) : null,
        seven_day_pct: rl.sevenDay ? pct(rl.sevenDay.pct) : null,
        seven_day_resets_at: rl.sevenDay?.resetsAt ? iso(rl.sevenDay.resetsAt) : null,
      }
    : null;
  if (rate && !rate.recorded_at) return bad("rateLimits.recordedAt is invalid.");

  await withDb((sql) => sql.begin(async (tx) => {
    // Upsert only: rows for days whose logs Claude Code has since deleted are kept.
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await tx`
        insert into usage_dashboard.claude_code_usage ${tx(chunk)}
        on conflict (machine, session_id, day) do update set
          project = excluded.project, models = excluded.models,
          input = excluded.input, output = excluded.output,
          cache_write = excluded.cache_write, cache_read = excluded.cache_read,
          responses = excluded.responses, first_at = excluded.first_at, last_at = excluded.last_at
      `;
    }
    if (rate) {
      await tx`
        insert into usage_dashboard.claude_rate_limits ${tx({ machine, ...rate })}
        on conflict (machine) do update set
          recorded_at = excluded.recorded_at,
          five_hour_pct = excluded.five_hour_pct, five_hour_resets_at = excluded.five_hour_resets_at,
          seven_day_pct = excluded.seven_day_pct, seven_day_resets_at = excluded.seven_day_resets_at
        where excluded.recorded_at > usage_dashboard.claude_rate_limits.recorded_at
      `;
    }
  }));

  return Response.json({ ok: true, rows: rows.length, rateLimits: Boolean(rate) });
}
