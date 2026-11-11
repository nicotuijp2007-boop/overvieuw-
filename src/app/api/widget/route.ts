import { after } from "next/server";
import { readCache, writeCache } from "@/lib/cache";
import type { Headroom } from "@/lib/headroom";
import { meter } from "@/lib/metering";
import { headline, headlineText, leftText, levelCounts, limitsView, urgencyText } from "@/lib/present";
import { fetchDashboard } from "@/lib/runner";
import { safeEqual } from "@/lib/secrets";

export const dynamic = "force-dynamic";

/**
 * GET /api/widget: what's left of every limit, for the home-screen widget.
 * Contract: docs/prompts/widget-api-contract.md (version 1).
 * Authenticated with `Authorization: Bearer <WIDGET_TOKEN>`, a read-only key that is separate
 * from the dashboard password and INGEST_SECRET. Excluded from the Basic-auth proxy.
 */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Widgets on several devices refresh every ~15 minutes, and every run costs Netlify credits.
 * Within this window the last response is served from the database (one short query)
 * instead of asking every service again. `generatedAt` stays the time it was computed.
 */
const CACHE_KEY = "widget-v1";
const CACHE_TTL_MS = 10 * 60_000;

function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

function limitJson(h: Headroom, now: number) {
  const m = h.metric;
  return {
    id: `${m.service}|${m.metric}`,
    service: m.service,
    serviceName: h.serviceName,
    metric: m.metric,
    leftPct: h.leftPct,
    usedPct: h.usedPct,
    used: m.used,
    limit: m.limit,
    unit: m.unit,
    leftText: leftText(h),
    level: h.level,
    resetsAt: m.resetsAt ?? null,
    elapsed: h.elapsed != null ? Math.round(h.elapsed * 1000) / 1000 : null,
    runsOutAt: h.runsOutAt ?? null,
    urgency: urgencyText(h, now)?.text ?? null,
    source: m.source,
    fetchedAt: m.fetchedAt,
    stale: Boolean(m.stale),
  };
}

export async function GET(req: Request) {
  meter("api/widget");
  const token = process.env.WIDGET_TOKEN;
  if (!token) return error("WIDGET_TOKEN is not set on the server.", 503);
  // Header only: a token in the query string would end up in logs and browser history.
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${token}`)) return error("Unauthorized", 401);

  const cached = await readCache<Record<string, unknown>>(CACHE_KEY).catch(() => null);
  if (cached && Date.now() - Date.parse(cached.updatedAt) < CACHE_TTL_MS) {
    return Response.json(cached.value, { headers: NO_STORE });
  }

  const { results } = await fetchDashboard();
  const now = Date.now();
  const { all, problems } = limitsView(results, now);
  const body = {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    dashboardUrl: new URL(req.url).origin,
    summary: { ...levelCounts(all), headline: headlineText(headline(all, now)) },
    limits: all.map((h) => limitJson(h, now)),
    problems,
  };
  after(() => writeCache(CACHE_KEY, body).catch(() => {}));
  return Response.json(body, { headers: NO_STORE });
}
