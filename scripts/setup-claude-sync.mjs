#!/usr/bin/env node
/**
 * One-time setup on a computer where you use Claude Code:
 *   1. writes DASHBOARD_URL / INGEST_SECRET / MACHINE_NAME to this repo's .env.local
 *   2. points Claude Code's status line at scripts/statusline.mjs (~/.claude/settings.json,
 *      backed up first; an existing status line command keeps working, chained after `--`)
 *   3. runs a test sync
 *
 * Usage:
 *   node scripts/setup-claude-sync.mjs --url https://your-site.netlify.app --secret <INGEST_SECRET> [--name laptop]
 * Needs only Node.js 20+ (no npm install).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATUSLINE = join(ROOT, "scripts", "statusline.mjs");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

const url = arg("url")?.replace(/\/+$/, "");
const secret = arg("secret");
const name = arg("name") || os.hostname();
if (!url || !secret) {
  fail("Gebruik: node scripts/setup-claude-sync.mjs --url https://jouw-site.netlify.app --secret <INGEST_SECRET> [--name laptop]");
}
if (!/^https?:\/\//.test(url)) fail(`--url moet met https:// beginnen (kreeg: ${url})`);
const [major] = process.versions.node.split(".").map(Number);
if (major < 20) fail(`Node.js 20 of nieuwer nodig (je hebt ${process.versions.node}).`);

// 1. .env.local: set our three keys, keep everything else.
const envPath = join(ROOT, ".env.local");
const wanted = { DASHBOARD_URL: url, INGEST_SECRET: secret, MACHINE_NAME: name };
const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
const seen = new Set();
const out = lines.map((line) => {
  const key = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
  if (key && key in wanted) {
    seen.add(key);
    return `${key}=${wanted[key]}`;
  }
  return line;
});
for (const [k, v] of Object.entries(wanted)) if (!seen.has(k)) out.push(`${k}=${v}`);
writeFileSync(envPath, out.join("\n").replace(/\n*$/, "\n"));
console.log(`✓ ${envPath} bijgewerkt (computernaam: ${name})`);

// 2. Claude Code settings: status line.
const claudeDir = process.env.CLAUDE_CONFIG_DIR?.split(",")[0]?.trim() || join(os.homedir(), ".claude");
const settingsPath = join(claudeDir, "settings.json");
let settings = {};
if (existsSync(settingsPath)) {
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    fail(`${settingsPath} is geen geldige JSON. Repareer het bestand en probeer opnieuw.`);
  }
  const backup = `${settingsPath}.bak-${Date.now()}`;
  copyFileSync(settingsPath, backup);
  console.log(`✓ Backup gemaakt: ${backup}`);
} else {
  mkdirSync(claudeDir, { recursive: true });
}

const ours = `node "${STATUSLINE}"`;
const existing = settings.statusLine?.type === "command" ? settings.statusLine.command : undefined;
let command = ours;
if (existing && !existing.includes("statusline.mjs")) {
  command = `${ours} -- ${existing}`;
  console.log(`✓ Je bestaande status line blijft werken: ${existing}`);
} else if (existing?.includes("statusline.mjs")) {
  command = existing.includes(" -- ") ? `${ours} -- ${existing.split(" -- ").slice(1).join(" -- ")}` : ours;
}
settings.statusLine = { ...(settings.statusLine ?? {}), type: "command", command };
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
console.log(`✓ Status line ingesteld in ${settingsPath}`);

// 3. Test sync.
console.log("… testsync naar het dashboard");
const res = spawnSync(process.execPath, [join(ROOT, "scripts", "sync-claude.mjs")], { encoding: "utf8" });
process.stdout.write(res.stdout ?? "");
if (res.status !== 0) {
  process.stderr.write(res.stderr ?? "");
  fail("Testsync mislukt. Controleer --url en --secret (moet gelijk zijn aan INGEST_SECRET op Netlify).");
}
console.log(`
✓ Klaar. Start Claude Code (opnieuw) en stuur één bericht: daarna staan je sessie- en weekpercentages
  op het dashboard. Daarna synchroniseert het vanzelf, hooguit elke 5 minuten zolang je Claude Code gebruikt.

  Ook bijwerken als Claude Code dicht is (elke 5 minuten, kost geen verbruik)? Draai daarna:
    node scripts/background-sync.mjs install`);
