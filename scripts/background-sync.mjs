#!/usr/bin/env node
/**
 * Keeps the dashboard's Claude numbers current without Claude Code open: a background job runs
 * scripts/sync-claude.mjs --usage every few minutes. That reads your plan usage (5-hour session,
 * week) with Claude Code's own /usage, without a terminal and without a model request, and
 * sends it together with your Claude Code token usage.
 *
 *   node scripts/background-sync.mjs install [--every 5]   test once, then install or update
 *   node scripts/background-sync.mjs status                last run and the job's state
 *   node scripts/background-sync.mjs uninstall             stop and remove the job
 *
 * macOS: a LaunchAgent. The sync scripts and the settings from .env.local are copied to
 * ~/Library/Application Support/usage-dashboard-sync, because macOS doesn't let background jobs
 * read ~/Documents, ~/Desktop or iCloud Drive, where this repo may live. Run `install` again
 * after these scripts change. Linux: prints a crontab line to add yourself.
 *
 * The job only runs while the computer is awake. Needs Node.js 20+, .env.local with
 * DASHBOARD_URL and INGEST_SECRET (scripts/setup-claude-sync.mjs writes it), and Claude Code
 * logged in with your claude.ai account (`claude auth login`).
 */
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findClaude } from "./lib/plan-usage.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = os.homedir();
export const LABEL = "local.usage-dashboard.claude-sync";
const SUPPORT = join(HOME, "Library", "Application Support", "usage-dashboard-sync");
const PLIST = join(HOME, "Library", "LaunchAgents", `${LABEL}.plist`);
const LOG = join(HOME, "Library", "Logs", "usage-dashboard-sync.log");
/** What the job needs, copied to SUPPORT with the same layout (so ROOT-relative paths still work). */
const FILES = ["scripts/sync-claude.mjs", "scripts/lib/claude-logs.mjs", "scripts/lib/plan-usage.mjs"];
/** Settings the job takes from .env.local. */
const ENV_KEYS = ["DASHBOARD_URL", "INGEST_SECRET", "MACHINE_NAME", "CLAUDE_CONFIG_DIR", "CLAUDE_BIN"];

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

/** KEY=VALUE lines, as scripts/sync-claude.mjs reads them. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

function readEnv(file) {
  try {
    return parseEnv(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The LaunchAgent: run the sync every `minutes`, and once right after loading. */
export function plistXml({ node, script, cwd, minutes, logPath, path }) {
  const str = (s) => `<string>${xml(s)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>${str(LABEL)}
  <key>ProgramArguments</key>
  <array>${[node, script, "--usage", "--quiet"].map(str).join("")}</array>
  <key>WorkingDirectory</key>${str(cwd)}
  <key>StartInterval</key><integer>${minutes * 60}</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key>${str("Background")}
  <key>StandardOutPath</key>${str(logPath)}
  <key>StandardErrorPath</key>${str(logPath)}
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>${str(path)}
    <key>USAGE_SYNC_LOG</key>${str(logPath)}
  </dict>
</dict>
</plist>
`;
}

/** The same job for cron (Linux). Paths are quoted for the shell. */
export function cronLine({ node, script, minutes, claude, logPath }) {
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  return `*/${minutes} * * * * CLAUDE_BIN=${q(claude)} ${q(node)} ${q(script)} --usage --quiet >> ${q(logPath)} 2>&1`;
}

/** Absolute path of `claude`: CLAUDE_BIN, else what this shell finds, else a known install location. */
function resolveClaude(env) {
  if (env.CLAUDE_BIN) return env.CLAUDE_BIN;
  const found = spawnSync("/bin/sh", ["-c", "command -v claude"], { encoding: "utf8" }).stdout?.trim();
  if (found?.startsWith("/")) return found;
  const guess = findClaude({}, HOME);
  return guess.startsWith("/") ? guess : null;
}

function everyArg() {
  const i = process.argv.indexOf("--every");
  if (i === -1) return 5;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 2 || n > 60) fail("--every moet een heel aantal minuten zijn, van 2 tot en met 60.");
  return n;
}

/** Runs the sync once with --usage from `root` and shows its output. */
function testSync(root, extraEnv) {
  console.log("… test: planverbruik ophalen met /usage en naar het dashboard sturen");
  const res = spawnSync(process.execPath, [join(root, "scripts", "sync-claude.mjs"), "--usage"], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    timeout: 120_000,
  });
  process.stdout.write(res.stdout ?? "");
  if (res.status !== 0) {
    process.stderr.write(res.stderr ?? "");
    fail("De test is mislukt, er is niets geïnstalleerd. Zie de melding hierboven.");
  }
}

const uid = () => process.getuid();
const launchctl = (...args) => spawnSync("launchctl", args, { encoding: "utf8" });

function loadAgent() {
  launchctl("bootout", `gui/${uid()}/${LABEL}`); // not loaded yet is fine
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = launchctl("bootstrap", `gui/${uid()}`, PLIST);
    if (res.status === 0) return;
    spawnSync("sleep", ["1"]); // launchd sometimes needs a moment after bootout
  }
  if (launchctl("load", "-w", PLIST).status === 0) return; // older macOS
  fail(`launchctl kon de achtergrondtaak niet starten: ${(res.stderr || res.stdout || "").trim()}`);
}

function install() {
  const minutes = everyArg();
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 20) fail(`Node.js 20 of nieuwer nodig (je hebt ${process.versions.node}).`);

  // Same precedence as scripts/sync-claude.mjs: real environment variables win over .env.local.
  const fileEnv = readEnv(join(ROOT, ".env.local"));
  const env = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k] || fileEnv[k]]));
  if (!env.DASHBOARD_URL || !env.INGEST_SECRET) {
    fail("DASHBOARD_URL en INGEST_SECRET ontbreken in .env.local. Draai eerst:\n  node scripts/setup-claude-sync.mjs --url https://jouw-site.netlify.app --secret <INGEST_SECRET>");
  }
  const claude = resolveClaude(env);
  if (!claude) fail("Claude Code niet gevonden. Installeer het (https://code.claude.com) of zet CLAUDE_BIN=/pad/naar/claude in .env.local.");
  env.CLAUDE_BIN = claude;
  console.log(`✓ Claude Code: ${claude}`);

  if (process.platform === "linux") return installCron(env, claude, minutes);
  if (process.platform !== "darwin") fail("De achtergrondtaak is er voor macOS (launchd) en Linux (cron).");

  // Copy the scripts and settings, so the job doesn't depend on where this repo is.
  for (const f of FILES) {
    mkdirSync(dirname(join(SUPPORT, f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(SUPPORT, f));
  }
  const envFile = join(SUPPORT, ".env.local");
  writeFileSync(envFile, ENV_KEYS.filter((k) => env[k]).map((k) => `${k}=${env[k]}`).join("\n") + "\n", { mode: 0o600 });
  chmodSync(envFile, 0o600);
  rmSync(join(SUPPORT, "data", "usage-disabled"), { force: true }); // a fresh install tries /usage again
  console.log(`✓ Scripts en instellingen gekopieerd naar ${SUPPORT}`);

  testSync(SUPPORT, { CLAUDE_BIN: claude });

  const path = [...new Set([dirname(process.execPath), dirname(claude), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"])].join(":");
  mkdirSync(dirname(PLIST), { recursive: true });
  mkdirSync(dirname(LOG), { recursive: true });
  writeFileSync(PLIST, plistXml({ node: process.execPath, script: join(SUPPORT, "scripts", "sync-claude.mjs"), cwd: SUPPORT, minutes, logPath: LOG, path }));
  loadAgent();
  console.log(`✓ Achtergrondtaak gestart: ${PLIST}

Klaar. Elke ${minutes} minuten haalt je Mac je sessie- en weekverbruik op via Claude Code's /usage en
stuurt het naar het dashboard, ook als Claude Code niet openstaat. Dat kost geen verbruik.
Het werkt zolang je Mac aan staat en wakker is (vergrendeld mag); in slaap staat de taak stil.

  Status:    node scripts/background-sync.mjs status
  Stoppen:   node scripts/background-sync.mjs uninstall
  Logboek:   ${LOG}
Heb je deze scripts bijgewerkt (git pull)? Draai install dan opnieuw.`);
}

function installCron(env, claude, minutes) {
  testSync(ROOT, { CLAUDE_BIN: claude });
  const logPath = join(HOME, ".cache", "usage-dashboard-sync.log");
  console.log(`
✓ Test gelukt. Laat cron het elke ${minutes} minuten doen: open \`crontab -e\` en voeg deze regel toe:

${cronLine({ node: process.execPath, script: join(ROOT, "scripts", "sync-claude.mjs"), minutes, claude, logPath })}

(Maak eerst de map voor het logboek: mkdir -p ~/.cache)`);
}

function uninstall() {
  if (process.platform !== "darwin") {
    console.log("Verwijder de regel met sync-claude.mjs uit je crontab (`crontab -e`).");
    return;
  }
  launchctl("bootout", `gui/${uid()}/${LABEL}`);
  rmSync(PLIST, { force: true });
  rmSync(SUPPORT, { recursive: true, force: true });
  rmSync(LOG, { force: true });
  console.log("✓ Achtergrondtaak gestopt en verwijderd, met de gekopieerde scripts en instellingen.");
}

function status() {
  const mac = process.platform === "darwin";
  if (mac) {
    if (!existsSync(PLIST)) {
      console.log("Niet geïnstalleerd. Installeren: node scripts/background-sync.mjs install");
      return;
    }
    const info = launchctl("print", `gui/${uid()}/${LABEL}`).stdout ?? "";
    const field = (name) => info.match(new RegExp(`^\\s*${name} = (.+)$`, "m"))?.[1];
    const minutes = Number(readFileSync(PLIST, "utf8").match(/<key>StartInterval<\/key><integer>(\d+)/)?.[1]) / 60;
    console.log(
      info
        ? `Achtergrondtaak: geladen, elke ${minutes} min (${field("state") ?? "?"}, runs: ${field("runs") ?? "?"}, laatste exitcode: ${field("last exit code") ?? "nog geen"})`
        : "Achtergrondtaak: geïnstalleerd maar niet geladen. Draai install opnieuw.",
    );
  }

  const file = join(mac ? SUPPORT : ROOT, "data", "last-sync.json");
  let last;
  try {
    last = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    console.log("Nog geen run gevonden.");
    return;
  }
  const when = new Date(last.at).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
  const pct = (w) => (w ? `${Math.round(w.usedPercentage)}%` : "–");
  console.log(`Laatste run: ${when} · ${last.ok ? "gelukt" : "mislukt"}`);
  if (last.plan) {
    const extra = (last.plan.scoped ?? []).map((s) => `, week (${s.label}) ${pct(s)}`).join("");
    console.log(`Planverbruik: sessie ${pct(last.plan.fiveHour)}, week ${pct(last.plan.sevenDay)}${extra}`);
  }
  if (last.error) console.log(`Fout: ${last.error}`);
  if (mac && existsSync(LOG)) {
    const tail = readFileSync(LOG, "utf8").trim().split("\n").slice(-3).join("\n");
    if (tail) console.log(`\nLaatste regels van ${LOG}:\n${tail}`);
  }
}

function main() {
  const cmd = process.argv[2];
  if (cmd === "install") install();
  else if (cmd === "uninstall") uninstall();
  else if (cmd === "status") status();
  else {
    console.log("Gebruik: node scripts/background-sync.mjs install [--every 5] | status | uninstall");
    process.exit(cmd ? 1 : 0);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
