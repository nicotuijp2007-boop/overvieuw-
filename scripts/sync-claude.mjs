#!/usr/bin/env node
/**
 * Sends this computer's Claude data to the dashboard:
 *  - Claude Code token usage from local logs (last 35 days, per session per day)
 *  - Pro plan limits (5-hour session, week): the last ones scripts/statusline.mjs recorded
 *    (data/claude-rate-limits.json), or with --usage, fresh ones from Claude Code's /usage,
 *    read without a terminal and without using any of your plan (scripts/lib/plan-usage.mjs)
 *
 * Run it by hand with `npm run sync` (or `node scripts/sync-claude.mjs --usage`), let the status
 * line script run it while you use Claude Code (at most every 5 minutes), or let the background
 * job run it with --usage every few minutes, also when Claude Code isn't open
 * (scripts/background-sync.mjs).
 *
 * Needs DASHBOARD_URL and INGEST_SECRET, from the environment or this folder's .env.local.
 * Optional MACHINE_NAME (default: this computer's hostname) and CLAUDE_BIN (path to `claude`).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate, loadEntries } from "./lib/claude-logs.mjs";
import { fetchPlanUsage } from "./lib/plan-usage.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const LIMITS_FILE = join(DATA, "claude-rate-limits.json");
/** Outcome of the last run, for `node scripts/background-sync.mjs status`. */
const STATUS_FILE = join(DATA, "last-sync.json");
/** Written when /usage made a model request, so the background job doesn't repeat that. */
const USAGE_OFF = join(DATA, "usage-disabled");

const quiet = process.argv.includes("--quiet");
const withUsage = process.argv.includes("--usage");
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
    const d = JSON.parse(readFileSync(LIMITS_FILE, "utf8"));
    const w = (x) => (x ? { pct: x.usedPercentage, resetsAt: x.resetsAt ? new Date(x.resetsAt * 1000).toISOString() : null } : null);
    return { recordedAt: d.recordedAt, fiveHour: w(d.fiveHour), sevenDay: w(d.sevenDay) };
  } catch {
    return null;
  }
}

/** Saves /usage numbers in the format scripts/statusline.mjs writes, unless that file is newer. */
function saveRateLimits(plan) {
  try {
    const current = JSON.parse(readFileSync(LIMITS_FILE, "utf8"));
    if (Date.parse(current.recordedAt) > Date.parse(plan.recordedAt)) return;
  } catch {}
  mkdirSync(DATA, { recursive: true });
  const tmp = `${LIMITS_FILE}.${process.pid}.tmp`;
  const { recordedAt, fiveHour, sevenDay } = plan;
  writeFileSync(tmp, JSON.stringify({ recordedAt, fiveHour, sevenDay, source: "usage" }, null, 2) + "\n");
  renameSync(tmp, LIMITS_FILE);
}

let statusWritten = false;
function writeStatus(status) {
  statusWritten = true;
  try {
    mkdirSync(DATA, { recursive: true });
    writeFileSync(STATUS_FILE, JSON.stringify({ at: new Date().toISOString(), ...status }, null, 2) + "\n");
  } catch {}
}

/** The background job logs errors to USAGE_SYNC_LOG; keep that file small. */
function trimLog() {
  const file = process.env.USAGE_SYNC_LOG;
  try {
    if (!file || statSync(file).size < 256_000) return;
    writeFileSync(file, readFileSync(file, "utf8").slice(-64_000));
  } catch {}
}

const pctText = (w) => (w ? `${Math.round(w.usedPercentage)}%` : "–");

async function main() {
  loadEnv();
  trimLog();
  const url = process.env.DASHBOARD_URL?.replace(/\/+$/, "");
  const secret = process.env.INGEST_SECRET;
  if (!url || !secret) throw new Error("Set DASHBOARD_URL and INGEST_SECRET in .env.local first.");

  // Fresh plan limits first, so they go in the same request. If this fails, the token usage
  // and the last recorded limits are still sent.
  let plan = null;
  let usageError = null;
  if (withUsage) {
    if (existsSync(USAGE_OFF)) {
      usageError = new Error(`${readFileSync(USAGE_OFF, "utf8").trim()} (Uitgezet; draai \`node scripts/background-sync.mjs install\` opnieuw na de update.)`);
    } else {
      try {
        plan = await fetchPlanUsage();
        saveRateLimits(plan);
      } catch (err) {
        usageError = err;
        if (err.modelCalled) {
          mkdirSync(DATA, { recursive: true });
          writeFileSync(USAGE_OFF, `${err.message}\n`);
        }
      }
    }
  }

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

  const planText = plan ? ` (sessie ${pctText(plan.fiveHour)}, week ${pctText(plan.sevenDay)}, via /usage)` : "";
  log(`Sent ${usage.length} session-days (${entries.length} responses from ${dirs.join(", ") || "no log folders"})` +
      `${rateLimits ? ` and plan limits${planText}` : ""} as "${machine}".`);

  writeStatus({
    ok: !usageError,
    sessionDays: usage.length,
    plan: plan && { fiveHour: plan.fiveHour, sevenDay: plan.sevenDay, scoped: plan.scoped, via: plan.via },
    error: usageError ? `Planverbruik: ${usageError.message}` : null,
  });
  if (usageError) throw new Error(`Token usage sent, but not the plan usage: ${usageError.message}`);
}

main().catch((err) => {
  if (!statusWritten) writeStatus({ ok: false, sessionDays: null, plan: null, error: err.message });
  console.error(`${quiet ? `[${new Date().toISOString()}] ` : ""}sync-claude: ${err.message}`);
  process.exit(1);
});
