/** Where a number came from. Shown as a badge on each metric. */
export type Source = "api" | "local" | "manual";

export interface UsageMetric {
  /** Service id, matching the key in limits.config.ts (e.g. "netlify"). */
  service: string;
  /** Human-readable metric name, e.g. "Bandwidth". Also the key for its limit in config. */
  metric: string;
  used: number;
  /**
   * The cap for this metric. Connectors set this only when the API returns it;
   * otherwise leave it null and the runner fills it in from limits.config.ts.
   */
  limit: number | null;
  unit: string;
  /** ISO timestamp of when this metric resets, if known. */
  resetsAt?: string;
  /**
   * ISO timestamp of when the current period started, if known. With resetsAt, the
   * dashboard shows how far into the period you are and projects usage at reset.
   */
  periodStart?: string;
  source: Source;
  /** ISO timestamp of when this value was fetched (or entered, for manual values). */
  fetchedAt: string;
  /** Optional one-line caveat shown under the metric, e.g. "estimate". */
  note?: string;
  /** Set by the runner when the source failed and this is the last known value. */
  stale?: boolean;
}

export interface Connector {
  /** Must match a key in limits.config.ts `services`. */
  id: string;
  /** Optional link to a details page, shown on the card. */
  details?: string;
  fetchUsage(): Promise<UsageMetric[]>;
}
