import { latestRateLimits, totalsSince, type Totals } from "@/lib/claudeData";
import { compactNumber, timeAgo } from "@/lib/format";
import type { Connector, UsageMetric } from "./types";

/**
 * Claude (Pro). Reads what scripts/sync-claude.mjs sent from your computers:
 *  - plan limits (5-hour session, weekly) recorded by the Claude Code status line
 *  - Claude Code token usage from local logs
 */
export const claudeCode: Connector = {
  id: "claude",
  details: "/claude-code",
  async fetchUsage() {
    const [limits, today, week] = await Promise.all([latestRateLimits(), totalsSince(1), totalsSince(7)]);
    const now = Date.now();
    const metrics: UsageMetric[] = [];

    if (limits) {
      const recorded = limits.recordedAt.toISOString();
      const add = (metric: string, pct: number | null, resets: Date | null, windowMs: number) => {
        if (pct == null) return;
        const expired = resets != null && resets.getTime() <= now;
        metrics.push({
          service: "claude",
          metric,
          // Once the window has reset we know usage dropped, but not to what.
          used: expired ? 0 : pct,
          limit: 100,
          unit: "%",
          resetsAt: !expired && resets ? resets.toISOString() : undefined,
          periodStart: !expired && resets ? new Date(resets.getTime() - windowMs).toISOString() : undefined,
          source: "local",
          fetchedAt: recorded,
          note: expired
            ? "Window has reset since last recorded. Use Claude Code to update."
            : `Recorded by the status line on ${limits.machine}`,
        });
      };
      add("Session (5-hour)", limits.fiveHourPct, limits.fiveHourResetsAt, 5 * 3600_000);
      add("Weekly (all models)", limits.sevenDayPct, limits.sevenDayResetsAt, 7 * 86_400_000);
    }

    if (week.responses === 0 && !limits) {
      throw new Error("No Claude data received yet. Run `npm run sync` on a computer where you use Claude Code (see README).");
    }

    const synced = week.lastAt ? `last activity ${timeAgo(week.lastAt.toISOString(), now)}` : "no activity";
    const note = (t: Totals) =>
      `${compactNumber(t.input + t.output)} in/out, ${compactNumber(t.cacheWrite + t.cacheRead)} cache, ${t.responses} responses`;
    const fetchedAt = new Date().toISOString();
    metrics.push(
      { service: "claude", metric: "Tokens today", used: today.total, limit: null, unit: "tokens", source: "local", fetchedAt, note: note(today) },
      {
        service: "claude",
        metric: "Tokens (7 days)",
        used: week.total,
        limit: null,
        unit: "tokens",
        source: "local",
        fetchedAt,
        note: `${note(week)}; ${week.machines} computer${week.machines === 1 ? "" : "s"}, ${synced}`,
      },
    );
    return metrics;
  },
};
