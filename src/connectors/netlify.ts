import type { Connector, UsageMetric } from "./types";

/**
 * Netlify REST API (https://api.netlify.com/api/v1), personal access token.
 *
 * Note: the usage endpoints used here are not in Netlify's public API reference.
 * They're what the Netlify dashboard itself calls, so they may change without notice:
 *   GET /accounts                        -> plan, billing period, capabilities.credits { included, used }
 *   GET /accounts/{slug}/bandwidth       -> { used (bytes), included, period_end_date }
 *   GET /{account_id}/builds/status      -> { minutes: { current, included_minutes } }
 * Production deploys are counted from the documented GET /sites/{id}/deploys.
 * Credits used are estimated from deploys + bandwidth (see below).
 */
const API = "https://api.netlify.com/api/v1";

/**
 * Credit prices on credit-based plans. 15 per production deploy matched the Usage page
 * (6 deploys = 90 credits). The bandwidth rate is from Netlify's pricing; check
 * docs.netlify.com > "How credits work" if your Usage page and the card drift apart.
 */
const CREDITS_PER_DEPLOY = 15;
const CREDITS_PER_GB = 10;

async function get<T>(path: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    throw new Error(`Kan api.netlify.com niet bereiken (${cause?.code ?? cause?.message ?? (err as Error).message})`);
  }
  if (res.status === 401) throw new Error("Netlify weigert het token (HTTP 401). Controleer NETLIFY_TOKEN.");
  if (!res.ok) throw new Error(`Netlify API ${path.split("?")[0]} gaf HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface Account {
  id: string;
  slug: string;
  name: string;
  default?: boolean;
  type_name?: string;
  current_usage_period_start?: string;
  next_usage_period_start?: string;
  capabilities?: Record<string, { included?: number | boolean | null; used?: number }>;
  usages_exceeded?: string[];
}

interface Deploy {
  created_at: string;
  context: string;
  state: string;
}

/** Production deploys that finished since `since`, across the account's sites. */
async function countProductionDeploys(token: string, slug: string, since: number): Promise<number> {
  const sites = await get<{ id: string; account_slug: string }[]>("/sites?filter=all&per_page=100", token);
  let count = 0;
  for (const site of sites.filter((s) => s.account_slug === slug)) {
    // Deploys come newest first; stop paging once we're past the period start.
    for (let page = 1; page <= 5; page++) {
      const deploys = await get<Deploy[]>(`/sites/${site.id}/deploys?per_page=100&page=${page}`, token);
      for (const d of deploys) {
        if (Date.parse(d.created_at) >= since && d.context === "production" && d.state === "ready") count++;
      }
      const oldest = deploys.at(-1);
      if (deploys.length < 100 || !oldest || Date.parse(oldest.created_at) < since) break;
    }
  }
  return count;
}

export const netlify: Connector = {
  id: "netlify",
  async fetchUsage() {
    const token = process.env.NETLIFY_TOKEN;
    if (!token) throw new Error("NETLIFY_TOKEN ontbreekt (in .env.local of de Netlify-omgevingsvariabelen).");

    const accounts = await get<Account[]>("/accounts", token);
    const wanted = process.env.NETLIFY_ACCOUNT;
    const account = wanted
      ? accounts.find((a) => a.slug === wanted)
      : accounts.find((a) => a.default) ?? accounts[0];
    if (!account) throw new Error(wanted ? `Geen Netlify-team met slug "${wanted}".` : "Geen Netlify-team gevonden.");

    const periodStart = Date.parse(account.current_usage_period_start ?? "") || Date.now() - 30 * 86_400_000;
    const resetsAt = account.next_usage_period_start ? new Date(account.next_usage_period_start).toISOString() : undefined;

    const [bandwidth, builds, deploys] = await Promise.all([
      get<{ used: number; included: number | null }>(`/accounts/${account.slug}/bandwidth`, token),
      get<{ minutes: { current: number; included_minutes: number | null } }>(`/${account.id}/builds/status`, token),
      countProductionDeploys(token, account.slug, periodStart),
    ]);

    const fetchedAt = new Date().toISOString();
    const exceeded = account.usages_exceeded?.length ? `Netlify meldt overschreden: ${account.usages_exceeded.join(", ")}` : undefined;
    const periodStartIso = account.current_usage_period_start ? new Date(account.current_usage_period_start).toISOString() : undefined;
    const base = { service: "netlify", source: "api" as const, fetchedAt, resetsAt, periodStart: periodStartIso };
    const metrics: UsageMetric[] = [];

    // capabilities.credits.used is not kept up to date (it reported 0 while the Usage page
    // showed 90 used), so credits are estimated from what the API does report accurately.
    const bandwidthGb = bandwidth.used / 1_000_000_000;
    const estimate = Math.round(deploys * CREDITS_PER_DEPLOY + bandwidthGb * CREDITS_PER_GB);
    const reported = account.capabilities?.credits;
    const included = typeof reported?.included === "number" ? reported.included : null;
    metrics.push({
      ...base,
      metric: "Credits",
      used: Math.max(estimate, reported?.used ?? 0),
      limit: included,
      unit: "credits",
      note:
        exceeded ??
        `Schatting: ${deploys} deploys × ${CREDITS_PER_DEPLOY} + bandbreedte × ${CREDITS_PER_GB}/GB (functies en verzoeken niet meegeteld)`,
    });
    metrics.push(
      { ...base, metric: "Productie-deploys", used: deploys, limit: null, unit: "deploys", note: "deze factuurperiode" },
      { ...base, metric: "Bandbreedte", used: Math.round((bandwidth.used / 1_000_000) * 10) / 10, limit: bandwidth.included ? bandwidth.included / 1_000_000 : null, unit: "MB" },
      { ...base, metric: "Buildminuten", used: builds.minutes.current, limit: builds.minutes.included_minutes, unit: "min" },
    );
    return metrics;
  },
};
