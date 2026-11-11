#!/usr/bin/env node
/**
 * Sends this computer's Claude data to the dashboard:
 *  - Claude Code token usage from local logs (last 35 days, per session per day)
 *  - Pro plan limits recorded by scripts/statusline.mjs (data/claude-rate-limits.json)
 *
 * Run by hand with `npm run sync`, or let the status line script run it in the
 * background (at most every 5 minutes).
 *
 * Needs DASHBOARD_URL and INGEST_SECRET, from the environment or this repo's .env.local.
 * Optional MACHINE_NAME (default: this computer's hostname).
 */
import { readFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate, loadEntries } from "./lib/claude-logs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const quiet = process.argv.includes("--quiet");
const log = (...a) => quiet || console.log(...a);

/** Minimal .env.local reader: KEY=VALUE lines; real environment variables win. */
function loadEnv() {
  try {
    for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {}
}

function readRateLimits() {
  try {
    const d = JSON.parse(readFileSync(join(ROOT, "data", "claude-rate-limits.json"), "utf8"));
    const w = (x) => (x ? { pct: x.usedPercentage, resetsAt: x.resetsAt ? new Date(x.resetsAt * 1000).toISOString() : null } : null);
    return { recordedAt: d.recordedAt, fiveHour: w(d.fiveHour), sevenDay: w(d.sevenDay) };
  } catch {
    return null;
  }
}

async function main() {
  loadEnv();
  const url = process.env.DASHBOARD_URL?.replace(/\/+$/, "");
  const secret = process.env.INGEST_SECRET;
  if (!url || !secret) throw new Error("Set DASHBOARD_URL and INGEST_SECRET in .env.local first.");

  const since = Date.now() - 35 * 86_400_000;
  const { dirs, entries } = await loadEntries(since);
  const usage = aggregate(entries);
  const rateLimits = readRateLimits();
  const machine = process.env.MACHINE_NAME || os.hostname();

  const res = await fetch(`${url}/api/ingest/claude`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify({ machine, usage, rateLimits }),
  });
  if (!res.ok) throw new Error(`Dashboard returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  log(`Sent ${usage.length} session-days (${entries.length} responses from ${dirs.join(", ") || "no log folders"})` +
      `${rateLimits ? " and plan limits" : ""} as "${machine}".`);
}

main().catch((err) => {
  console.error(`sync-claude: ${err.message}`);
  process.exit(1);
});
