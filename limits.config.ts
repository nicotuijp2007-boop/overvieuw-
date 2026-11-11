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
    enabled: true,
    limits: {
      "Requests": { limit: 10_000, unit: "requests", where: "Made up, for the demo." },
      "Storage": { limit: 1_000, unit: "MB", where: "Made up, for the demo." },
      "Build minutes": { limit: 300, unit: "min", where: "Made up, for the demo." },
    },
  },
  // Always throws, to show that one broken connector only breaks its own card.
  "mock-broken": {
    name: "Broken mock",
    enabled: true,
    limits: {},
  },

  claude: {
    name: "Claude (Pro)",
    enabled: true,
    limits: {
      // Claude only reports these as percentages, so the limit is 100.
      // Run /usage in Claude Code or open claude.ai > Settings > Usage to see them.
      "Session (5-hour)": { limit: 100, unit: "%", where: "claude.ai > Settings > Usage, or /usage in Claude Code" },
      "Weekly (all models)": { limit: 100, unit: "%", where: "claude.ai > Settings > Usage, or /usage in Claude Code" },
    },
  },

  supabase: {
    name: "Supabase (Free)",
    enabled: true,
    limits: {
      "Database size": { limit: 500, unit: "MB", where: "supabase.com/pricing, Free plan > Database size" },
      "Storage size": { limit: 1_024, unit: "MB", where: "supabase.com/pricing, Free plan > File storage" },
      "Egress": { limit: 5, unit: "GB", where: "supabase.com/pricing, Free plan > Egress" },
      "Monthly active users": { limit: 50_000, unit: "MAU", where: "supabase.com/pricing, Free plan > Monthly active users" },
    },
  },

  netlify: {
    name: "Netlify (Free)",
    enabled: true,
    limits: {
      // Free is a credit-based plan: deploys, bandwidth, compute etc. all draw from one credit pool.
      // The API also returns the included credits, which takes precedence over this value.
      "Credits": { limit: 300, unit: "credits", where: "app.netlify.com > your team > Usage & billing" },
    },
  },

  n8n: {
    name: "n8n (self-hosted)",
    enabled: true,
    // Self-hosted Community Edition has no execution quota. Executions are counted for info only.
    limits: {},
  },
};
