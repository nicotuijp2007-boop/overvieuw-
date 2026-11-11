import { promises as fs } from "node:fs";
import path from "node:path";
import { addTo, dayKey, emptyTotals, loadEntries } from "@/lib/claudeLogs";
import { formatNumber } from "@/lib/format";
import type { Connector, UsageMetric } from "./types";

/** Written by scripts/statusline.mjs. */
const RATE_LIMITS_FILE = path.join(process.cwd(), "data", "claude-rate-limits.json");

interface RecordedWindow {
  usedPercentage: number;
  resetsAt: number | null; // Unix seconds
}

async function readRateLimits(): Promise<UsageMetric[]> {
  let data: { recordedAt: string; fiveHour: RecordedWindow | null; sevenDay: RecordedWindow | null };
  try {
    data = JSON.parse(await fs.readFile(RATE_LIMITS_FILE, "utf8"));
  } catch {
    return []; // status line script not set up yet: manual entries are used instead
  }
  const now = Date.now();
  const metrics: UsageMetric[] = [];
  const add = (metric: string, w: RecordedWindow | null) => {
    if (!w) return;
    const resetMs = w.resetsAt ? w.resetsAt * 1000 : null;
    const expired = resetMs != null && resetMs <= now;
    metrics.push({
      service: "claude",
      metric,
      // Once the window has reset we know usage dropped, but not to what.
      used: expired ? 0 : w.usedPercentage,
      limit: 100,
      unit: "%",
      resetsAt: !expired && resetMs ? new Date(resetMs).toISOString() : undefined,
      source: "local",
      fetchedAt: data.recordedAt,
      note: expired
        ? "Window has reset since last recorded. Use Claude Code to update."
        : "Recorded by the status line while Claude Code runs",
    });
  };
  add("Session (5-hour)", data.fiveHour);
  add("Weekly (all models)", data.sevenDay);
  return metrics;
}

export const claudeCode: Connector = {
  id: "claude",
  details: "/claude-code",
  async fetchUsage() {
    const [{ entries, dirs }, limits] = await Promise.all([loadEntries(), readRateLimits()]);
    if (dirs.length === 0 && limits.length === 0) {
      throw new Error("No Claude Code logs found in ~/.claude/projects. Set CLAUDE_CONFIG_DIR in .env.local if they live elsewhere.");
    }

    const fetchedAt = new Date().toISOString();
    const today = dayKey(Date.now());
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const t = emptyTotals();
    const w = emptyTotals();
    for (const e of entries) {
      if (dayKey(e.timestamp) === today) addTo(t, e);
      if (e.timestamp >= weekAgo) addTo(w, e);
    }
    const note = (x: typeof t) =>
      `${formatNumber(x.input + x.output)} in/out · ${formatNumber(x.cacheWrite + x.cacheRead)} cache · ${x.responses} responses`;

    return [
      ...limits,
      { service: "claude", metric: "Claude Code tokens today", used: t.total, limit: null, unit: "tokens", source: "local", fetchedAt, note: note(t) },
      { service: "claude", metric: "Claude Code tokens (7 days)", used: w.total, limit: null, unit: "tokens", source: "local", fetchedAt, note: note(w) },
    ];
  },
};
