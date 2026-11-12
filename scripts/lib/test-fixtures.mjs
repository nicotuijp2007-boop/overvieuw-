/**
 * Test helpers: what `claude -p /usage --output-format stream-json --verbose` prints, and a
 * stand-in `claude` executable that prints a given output. Used by the *.test.mjs files only.
 */
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const SESSION_RESETS = "2026-11-12T14:00:00.000Z";
export const WEEK_RESETS = "2026-11-15T08:00:00.000Z";

export const USAGE_TEXT = [
  "You are currently using your subscription to power your Claude Code usage",
  "",
  "Current session: 23% used · resets 3pm (Europe/Amsterdam)",
  "Current week (all models): 41% used · resets Nov 15, 9am (Europe/Amsterdam)",
  "Current week (Fable): 12% used · resets Nov 15, 9am (Europe/Amsterdam)",
].join("\n");

export const USAGE_REPORT = {
  session: { total_cost_usd: 0, total_api_duration_ms: 0, total_duration_ms: 9, total_lines_added: 0, total_lines_removed: 0, model_usage: {} },
  rate_limits: {
    limits: [
      { kind: "session", group: "session", percent: 23.4, resets_at: SESSION_RESETS, scope: null, severity: "normal", is_active: true },
      { kind: "weekly_all", group: "weekly", percent: 41.2, resets_at: WEEK_RESETS, scope: null, severity: "normal", is_active: false },
      { kind: "weekly_scoped", group: "weekly", percent: 12, resets_at: WEEK_RESETS, scope: { model: { display_name: "Fable" } }, severity: "normal", is_active: false },
    ],
    extra_usage: null,
  },
};

const NO_TOKENS = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/** stream-json lines for a /usage run. `withReport: false` = a Claude Code that doesn't attach the report. */
export function usageOutput({ report = USAGE_REPORT, withReport = true, text = USAGE_TEXT, usage = NO_TOKENS, isError = false } = {}) {
  const lines = [
    { type: "system", subtype: "init", session_id: "s1", cwd: "/tmp/x", model: "claude-haiku-5-5", tools: [], mcp_servers: [], uuid: "u0" },
    {
      type: "assistant",
      message: { id: "m1", type: "message", role: "assistant", model: "<synthetic>", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: NO_TOKENS },
      parent_tool_use_id: null,
      local_command_source: "usage",
      session_id: "s1",
      uuid: "u1",
      ...(withReport && { usage_report: report }),
    },
    { type: "result", subtype: isError ? "error_during_execution" : "success", is_error: isError, num_turns: 0, result: text, session_id: "s1", total_cost_usd: 0, usage, uuid: "u2" },
  ];
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}

/**
 * A fake `claude`: prints the file STUB_OUT, writes STUB_STDERR to stderr, exits with
 * STUB_EXIT, waits STUB_SLEEP_MS first, and records its arguments, working directory and
 * some environment variables as JSON lines in STUB_RECORD.
 */
export function makeStubClaude(dir = mkdtempSync(path.join(os.tmpdir(), "stub-claude-"))) {
  const bin = path.join(dir, "claude");
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const fs = require("node:fs");
const e = process.env;
if (e.STUB_RECORD) fs.appendFileSync(e.STUB_RECORD, JSON.stringify({
  args: process.argv.slice(2), cwd: process.cwd(),
  apiKey: "ANTHROPIC_API_KEY" in e, authToken: "ANTHROPIC_AUTH_TOKEN" in e, oauthToken: "CLAUDE_CODE_OAUTH_TOKEN" in e,
}) + "\\n");
setTimeout(() => {
  if (e.STUB_OUT) process.stdout.write(fs.readFileSync(e.STUB_OUT, "utf8"));
  if (e.STUB_STDERR) process.stderr.write(e.STUB_STDERR);
  process.exitCode = Number(e.STUB_EXIT || 0);
}, Number(e.STUB_SLEEP_MS || 0));
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}
