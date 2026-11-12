/**
 * Reads your Claude plan usage (5-hour session and weekly %) by asking Claude Code itself:
 * it runs `claude -p "/usage"`, without a terminal. /usage is a local command: it reads the
 * numbers from claude.ai and makes no model request, so it uses none of your plan.
 * Claude Code attaches a structured copy of the report (`usage_report`) to its stream-json
 * output; the report's text is the fallback.
 *
 * Needs a normal claude.ai login on this computer (`claude auth login`, or /login in Claude
 * Code). A token from `claude setup-token` can only make model requests, so with that
 * token Claude Code can't read your plan usage.
 *
 * This only reads; scripts/sync-claude.mjs sends the result to the dashboard.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const USAGE_TIMEOUT_MS = 60_000;

/**
 * Arguments for a headless /usage run. The working directory is an empty folder and only
 * project settings load, so your user hooks, plugins and MCP servers don't start every few
 * minutes. The model, tools and system prompt only matter if a Claude Code version sent
 * "/usage" to the model instead of running it locally: then the request stays tiny, and
 * parseUsageOutput reports it so the background job stops instead of repeating it.
 */
export const USAGE_ARGS = [
  "-p", "/usage",
  "--output-format", "stream-json", "--verbose",
  "--no-session-persistence",
  "--setting-sources", "project",
  "--strict-mcp-config",
  "--model", "haiku",
  "--tools", "",
  "--max-turns", "1",
  "--system-prompt", "Reply with OK.",
];

/**
 * Credentials that would replace your claude.ai login. With them Claude Code can't read plan
 * usage, so they're left out of the environment of the /usage run only.
 */
const LOGIN_OVERRIDES = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"];

/** Where `claude` usually lives. launchd and cron start with a bare PATH, so look there too. */
export function claudeCandidates(env = process.env, home = os.homedir()) {
  return [
    env.CLAUDE_BIN,
    path.join(home, ".local", "bin", "claude"), // native installer
    path.join(home, ".claude", "local", "claude"), // older local install
    "/opt/homebrew/bin/claude", // Homebrew on Apple silicon
    "/usr/local/bin/claude", // Homebrew on Intel, npm -g
  ].filter(Boolean);
}

/** CLAUDE_BIN, else the first known location that exists, else plain `claude` from PATH. */
export function findClaude(env = process.env, home = os.homedir(), exists = existsSync) {
  if (env.CLAUDE_BIN) return env.CLAUDE_BIN;
  return claudeCandidates(env, home).find((p) => exists(p)) ?? "claude";
}

/** A 0–100 percentage and an ISO reset time, as the usage report has them, in the status line's format. */
function windowFrom(percent, resetsAt) {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return null;
  const ms = typeof resetsAt === "string" ? Date.parse(resetsAt) : NaN;
  return { usedPercentage: percent, resetsAt: Number.isNaN(ms) ? null : Math.floor(ms / 1000) };
}

/** Text a stream-json line carries: assistant text blocks, local command output, or the result. */
function textsOf(msg) {
  if (msg?.type === "assistant" && Array.isArray(msg.message?.content)) {
    return msg.message.content.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text);
  }
  if (msg?.type === "system" && msg.subtype === "local_command_output" && typeof msg.content === "string") return [msg.content];
  if (msg?.type === "result" && typeof msg.result === "string") return [msg.result];
  return [];
}

const NOT_AVAILABLE =
  "Claude Code kon je planverbruik niet ophalen. Log in met je claude.ai-account: `claude auth login` " +
  "(een token van `claude setup-token` kan dit niet lezen).";

/**
 * Parses the stream-json output of a /usage run.
 * Returns { fiveHour, sevenDay, scoped: [{ label, usedPercentage, resetsAt }], via: "report" | "text" }.
 * Throws when the output has no plan usage, with `modelCalled: true` on the error when the
 * run made a model request (this Claude Code version doesn't run /usage locally).
 */
export function parseUsageOutput(stdout) {
  let report;
  let result;
  const texts = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg && typeof msg === "object" && "usage_report" in msg) report = msg.usage_report;
    if (msg?.type === "result") result = msg;
    texts.push(...textsOf(msg));
  }

  const u = result?.usage;
  if (u && (u.input_tokens > 0 || u.output_tokens > 0)) {
    throw Object.assign(
      new Error("Deze Claude Code-versie stuurde /usage naar het model in plaats van het zelf te tonen (dat kost verbruik). Update Claude Code (`claude update`) en probeer opnieuw."),
      { modelCalled: true },
    );
  }

  const limits = report?.rate_limits?.limits;
  if (Array.isArray(limits) && limits.length) {
    const row = (kind) => limits.find((l) => l?.kind === kind);
    const session = row("session") ?? limits.find((l) => l?.group === "session");
    const week = row("weekly_all");
    const scoped = limits
      .filter((l) => l?.kind === "weekly_scoped")
      .map((l) => ({ label: l.scope?.model?.display_name ?? l.scope?.surface?.display_name ?? "", ...windowFrom(l.percent, l.resets_at) }))
      .filter((l) => typeof l.usedPercentage === "number");
    const fiveHour = session ? windowFrom(session.percent, session.resets_at) : null;
    const sevenDay = week ? windowFrom(week.percent, week.resets_at) : null;
    if (fiveHour || sevenDay) return { fiveHour, sevenDay, scoped, via: "report" };
  }

  // Fallback: the report's text, e.g. "Current session: 23% used · resets 3pm".
  // The reset times there are formatted for people, so they're left out. The same text comes
  // in both the assistant message and the result, hence the Set.
  const text = [...new Set(texts)].join("\n");
  const pct = (re) => {
    const m = text.match(re);
    return m ? { usedPercentage: Number(m[1]), resetsAt: null } : null;
  };
  const fiveHour = pct(/Current session: (\d+(?:\.\d+)?)% used/);
  const sevenDay = pct(/Current week \(all models\): (\d+(?:\.\d+)?)% used/);
  if (fiveHour || sevenDay) {
    const scoped = [...text.matchAll(/Current week \(([^)]+)\): (\d+(?:\.\d+)?)% used/g)]
      .filter((m) => m[1] !== "all models")
      .map((m) => ({ label: m[1], usedPercentage: Number(m[2]), resetsAt: null }));
    return { fiveHour, sevenDay, scoped, via: "text" };
  }

  if (report && report.rate_limits === null) throw new Error(NOT_AVAILABLE);
  const said = (result?.is_error && typeof result.result === "string" ? result.result : text).trim().replace(/\s+/g, " ").slice(0, 200);
  throw new Error(said ? `${NOT_AVAILABLE} Claude Code zei: "${said}"` : NOT_AVAILABLE);
}

/**
 * Runs `claude -p /usage` and returns
 * { recordedAt, fiveHour, sevenDay, scoped, via }, with fiveHour/sevenDay as
 * { usedPercentage, resetsAt (Unix seconds) | null } or null.
 */
export async function fetchPlanUsage({
  bin = findClaude(),
  env = process.env,
  cwd = path.join(os.tmpdir(), "usage-dashboard-claude"),
  timeoutMs = USAGE_TIMEOUT_MS,
} = {}) {
  mkdirSync(cwd, { recursive: true });
  const childEnv = { ...env };
  for (const k of LOGIN_OVERRIDES) delete childEnv[k];

  const { code, stdout, stderr, timedOut } = await new Promise((resolve, reject) => {
    const child = spawn(bin, USAGE_ARGS, { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let timedOut = false;
    const cap = (s, chunk) => (s.length < 4_000_000 ? s + chunk : s);
    child.stdout.on("data", (c) => (out = cap(out, c)));
    child.stderr.on("data", (c) => (err = cap(err, c)));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        e.code === "ENOENT"
          ? new Error(`Claude Code niet gevonden (${bin}). Zet CLAUDE_BIN in .env.local op het pad van \`claude\` (zie \`command -v claude\`).`)
          : e,
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: out, stderr: err, timedOut });
    });
  });

  if (timedOut) throw new Error(`Claude Code gaf binnen ${timeoutMs / 1000}s geen antwoord op /usage.`);
  try {
    return { recordedAt: new Date().toISOString(), ...parseUsageOutput(stdout) };
  } catch (e) {
    const hint = code !== 0 && stderr.trim() ? ` (exitcode ${code}: ${stderr.trim().replace(/\s+/g, " ").slice(0, 200)})` : "";
    throw Object.assign(new Error(e.message + hint), { modelCalled: e.modelCalled === true });
  }
}
