import { latestRateLimits, totalsSince } from "@/lib/claudeData";
import { compactNumber } from "@/lib/format";
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
          note: expired ? "Venster is gereset sinds de laatste meting; gebruik Claude Code om bij te werken" : undefined,
        });
      };
      add("Sessie (5 uur)", limits.fiveHourPct, limits.fiveHourResetsAt, 5 * 3600_000);
      add("Week (alle modellen)", limits.sevenDayPct, limits.sevenDayResetsAt, 7 * 86_400_000);
    }

    if (week.responses === 0 && !limits) {
      throw new Error("Nog geen Claude-gegevens ontvangen. Draai `npm run sync` op een computer waar je Claude Code gebruikt (zie README).");
    }

    // Input/output is what you actually typed and got back; cache reads dominate totals,
    // so they're a secondary line.
    const fetchedAt = (week.syncedAt ?? new Date()).toISOString();
    metrics.push(
      {
        service: "claude",
        metric: "Tokens vandaag",
        used: today.input + today.output,
        limit: null,
        unit: "in/uit",
        source: "local",
        fetchedAt,
        note: `+ ${compactNumber(today.cacheWrite + today.cacheRead)} cache`,
      },
      {
        service: "claude",
        metric: "Tokens (7 dagen)",
        used: week.input + week.output,
        limit: null,
        unit: "in/uit",
        source: "local",
        fetchedAt,
        note: `+ ${compactNumber(week.cacheWrite + week.cacheRead)} cache`,
      },
    );
    return metrics;
  },
};
