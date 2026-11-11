#!/usr/bin/env node
/**
 * Claude Code status line script that records your Pro/Max usage limits for the dashboard.
 *
 * Claude Code pipes a JSON object to the status line command. On Pro/Max plans it includes
 * rate_limits.five_hour / rate_limits.seven_day ({ used_percentage, resets_at }).
 * This script saves just those numbers to data/claude-rate-limits.json, starts
 * scripts/sync-claude.mjs in the background (at most every 5 minutes) to send them and your
 * Claude Code token usage to the dashboard, then prints a status line.
 *
 * Setup (~/.claude/settings.json):
 *   "statusLine": { "type": "command", "command": "node /absolute/path/to/repo/scripts/statusline.mjs" }
 *
 * Already have a status line? Pass your existing command after `--`; it receives the same
 * input and its output is printed instead of ours:
 *   "command": "node /path/to/repo/scripts/statusline.mjs -- ~/.claude/my-statusline.sh"
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const OUT = join(SCRIPTS, "..", "data", "claude-rate-limits.json");
const LAST_SYNC = join(SCRIPTS, "..", "data", ".last-sync");
const SYNC_EVERY_MS = 5 * 60_000;

let raw = "";
try {
  raw = readFileSync(0, "utf8");
} catch {}

let input = {};
try {
  input = JSON.parse(raw);
} catch {}

const window = (w) =>
  w && typeof w.used_percentage === "number"
    ? { usedPercentage: w.used_percentage, resetsAt: typeof w.resets_at === "number" ? w.resets_at : null }
    : null;

const fiveHour = window(input.rate_limits?.five_hour);
const sevenDay = window(input.rate_limits?.seven_day);

// Only write when Claude Code actually sent limits (they appear after the first response).
if (fiveHour || sevenDay) {
  try {
    mkdirSync(dirname(OUT), { recursive: true });
    const tmp = `${OUT}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ recordedAt: new Date().toISOString(), fiveHour, sevenDay }, null, 2) + "\n");
    renameSync(tmp, OUT);
  } catch {
    // Never break the status line because of the dashboard.
  }
}

// Background sync, throttled. Detached so the status line never waits on the network.
try {
  let last = 0;
  try {
    last = statSync(LAST_SYNC).mtimeMs;
  } catch {}
  if (Date.now() - last > SYNC_EVERY_MS) {
    mkdirSync(dirname(LAST_SYNC), { recursive: true });
    writeFileSync(LAST_SYNC, "");
    spawn(process.execPath, [join(SCRIPTS, "sync-claude.mjs"), "--quiet"], { detached: true, stdio: "ignore" }).unref();
  }
} catch {}

const sep = process.argv.indexOf("--");
if (sep !== -1 && process.argv.length > sep + 1) {
  const cmd = process.argv.slice(sep + 1).join(" ");
  const res = spawnSync(cmd, { input: raw, shell: true, encoding: "utf8" });
  process.stdout.write(res.stdout ?? "");
} else {
  const parts = [input.model?.display_name ?? "Claude"];
  if (fiveHour) parts.push(`5h ${Math.round(fiveHour.usedPercentage)}%`);
  if (sevenDay) parts.push(`7d ${Math.round(sevenDay.usedPercentage)}%`);
  process.stdout.write(parts.join(" · "));
}
