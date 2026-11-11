/**
 * Your plan limits. Edit by hand.
 *
 * Most APIs report how much you've used but not your plan's cap, so the caps live here.
 * Keys under `limits` must match the metric names the connector reports.
 * A limit returned by an API takes precedence over the one here.
 *
 * Numbers below are starting points for the Free / Pro plans. Plans change:
 * check the page named in each `where` before trusting them.
 */

export interface MetricLimit {
  limit: number;
  unit: string;
  /** Where to find (or verify) this number. */
  where: string;
  /**
   * Length of the period this limit resets over. Used when a value (e.g. a manual entry)
   * has a reset date but no start date, so the dashboard can still show how far into the
   * period you are. "month" = one calendar month before the reset.
   */
  period?: "month" | "week" | "day";
}

export interface ServiceConfig {
  /** Display name on the card. */
  name: string;
  /** Set to false to hide the card and skip fetching. */
  enabled: boolean;
  limits: Record<string, MetricLimit>;
}

export const services: Record<string, ServiceConfig> = {
  // Demo data so the dashboard works before any token is set up.
  // Set enabled: false once your real connectors work.
  mock: {
    name: "Mock service",
    enabled: false,
    limits: {
      "Requests": { limit: 10_000, unit: "requests", where: "Made up, for the demo." },
      "Storage": { limit: 1_000, unit: "MB", where: "Made up, for the demo." },
      "Build minutes": { limit: 300, unit: "min", where: "Made up, for the demo." },
    },
  },
  // Always throws, to show that one broken connector only breaks its own card.
  "mock-broken": {
    name: "Broken mock",
    enabled: false,
    limits: {},
  },

  claude: {
    name: "Claude (Pro)",
    enabled: true,
    limits: {
      // Claude only reports these as percentages, so the limit is 100.
      // Run /usage in Claude Code or open claude.ai > Settings > Usage to see them.
      "Sessie (5 uur)": { limit: 100, unit: "%", where: "claude.ai > Settings > Usage, or /usage in Claude Code" },
      "Week (alle modellen)": { limit: 100, unit: "%", where: "claude.ai > Settings > Usage, or /usage in Claude Code", period: "week" },
    },
  },

  supabase: {
    name: "Supabase (Free)",
    enabled: true,
    limits: {
      "Databasegrootte": { limit: 500, unit: "MB", where: "supabase.com/pricing, Free plan > Database size" },
      "Bestandsopslag": { limit: 1_024, unit: "MB", where: "supabase.com/pricing, Free plan > File storage" },
      // Not available via the API: enter it under "Handmatige waarden", with the reset date of your billing cycle.
      "Egress": { limit: 5, unit: "GB", where: "supabase.com/pricing, Free plan > Egress", period: "month" },
      "Actieve gebruikers (MAU)": { limit: 50_000, unit: "MAU", where: "supabase.com/pricing, Free plan > Monthly active users" },
    },
  },

  netlify: {
    name: "Netlify (Free)",
    enabled: true,
    limits: {
      // Free is a credit-based plan: deploys, bandwidth, compute etc. all draw from one credit pool.
      // The API also returns the included credits, which takes precedence over this value.
      "Credits": { limit: 300, unit: "credits", where: "app.netlify.com > your team > Usage & billing", period: "month" },
    },
  },

  // Not in use yet, and there's no connector yet: see "n8n (planned)" in the README.
  n8n: {
    name: "n8n (self-hosted)",
    enabled: false,
    // Self-hosted Community Edition has no execution quota. Executions will be counted for info only.
    limits: {},
  },
};
