import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fetchPlanUsage, findClaude, parseUsageOutput, USAGE_ARGS } from "./plan-usage.mjs";
import { makeStubClaude, SESSION_RESETS, USAGE_REPORT, usageOutput, WEEK_RESETS } from "./test-fixtures.mjs";

const secs = (iso) => Date.parse(iso) / 1000;

test("reads the structured usage report", () => {
  assert.deepEqual(parseUsageOutput(usageOutput()), {
    fiveHour: { usedPercentage: 23.4, resetsAt: secs(SESSION_RESETS) },
    sevenDay: { usedPercentage: 41.2, resetsAt: secs(WEEK_RESETS) },
    scoped: [{ label: "Fable", usedPercentage: 12, resetsAt: secs(WEEK_RESETS) }],
    via: "report",
  });
});

test("falls back to the text when Claude Code attaches no report", () => {
  assert.deepEqual(parseUsageOutput(usageOutput({ withReport: false })), {
    fiveHour: { usedPercentage: 23, resetsAt: null },
    sevenDay: { usedPercentage: 41, resetsAt: null },
    scoped: [{ label: "Fable", usedPercentage: 12, resetsAt: null }],
    via: "text",
  });
});

test("a session row without a reset time (no active window) still counts", () => {
  const report = structuredClone(USAGE_REPORT);
  report.rate_limits.limits[0] = { ...report.rate_limits.limits[0], percent: 0, resets_at: null };
  assert.deepEqual(parseUsageOutput(usageOutput({ report })).fiveHour, { usedPercentage: 0, resetsAt: null });
});

test("no plan usage (e.g. a setup-token login): explains how to log in", () => {
  const out = usageOutput({ report: { ...USAGE_REPORT, rate_limits: null }, text: "Session cost: $0.00" });
  assert.throws(() => parseUsageOutput(out), /claude auth login/);
});

test("an error from Claude Code is passed on", () => {
  const out = usageOutput({ withReport: false, text: "Not logged in · Please run /login", isError: true });
  assert.throws(() => parseUsageOutput(out), /Not logged in · Please run \/login/);
});

test("a run that made a model request is flagged, so the job can stop", () => {
  const out = usageOutput({ withReport: false, text: "OK", usage: { input_tokens: 12, output_tokens: 2 } });
  assert.throws(() => parseUsageOutput(out), (err) => err.modelCalled === true && /claude update/.test(err.message));
});

test("ignores lines that aren't JSON", () => {
  const out = `warning: something\n${usageOutput()}{"partial":`;
  assert.equal(parseUsageOutput(out).via, "report");
});

test("findClaude: CLAUDE_BIN, then known locations, then PATH", () => {
  assert.equal(findClaude({ CLAUDE_BIN: "/x/claude" }, "/home/me", () => false), "/x/claude");
  assert.equal(findClaude({}, "/home/me", (p) => p === "/opt/homebrew/bin/claude"), "/opt/homebrew/bin/claude");
  assert.equal(findClaude({}, "/home/me", (p) => p === "/home/me/.local/bin/claude"), "/home/me/.local/bin/claude");
  assert.equal(findClaude({}, "/home/me", () => false), "claude");
});

function stubEnv(dir, out, extra = {}) {
  const outFile = path.join(dir, "out.jsonl");
  writeFileSync(outFile, out);
  return { ...process.env, STUB_OUT: outFile, STUB_RECORD: path.join(dir, "record.jsonl"), ...extra };
}
const records = (dir) => readFileSync(path.join(dir, "record.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("fetchPlanUsage runs /usage headless, in its own folder, without login overrides", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "plan-usage-"));
  const bin = makeStubClaude(dir);
  const cwd = path.join(dir, "cwd");
  const env = stubEnv(dir, usageOutput(), { ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_AUTH_TOKEN: "t", CLAUDE_CODE_OAUTH_TOKEN: "o" });
  const plan = await fetchPlanUsage({ bin, env, cwd });
  assert.equal(plan.fiveHour.usedPercentage, 23.4);
  assert.ok(!Number.isNaN(Date.parse(plan.recordedAt)));
  const [rec] = records(dir);
  assert.deepEqual(rec.args, USAGE_ARGS);
  assert.equal(rec.cwd, cwd);
  assert.deepEqual([rec.apiKey, rec.authToken, rec.oauthToken], [false, false, false]);
});

test("fetchPlanUsage: a failing run reports the exit code and Claude Code's message", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "plan-usage-"));
  const env = stubEnv(dir, "", { STUB_EXIT: "1", STUB_STDERR: "Invalid API key · Please run /login" });
  await assert.rejects(fetchPlanUsage({ bin: makeStubClaude(dir), env, cwd: dir }), /exitcode 1: Invalid API key/);
});

test("fetchPlanUsage: Claude Code not installed", async () => {
  await assert.rejects(fetchPlanUsage({ bin: "/nonexistent/claude", cwd: os.tmpdir() }), /Claude Code niet gevonden/);
});

test("fetchPlanUsage: gives up after the time limit", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "plan-usage-"));
  const env = stubEnv(dir, usageOutput(), { STUB_SLEEP_MS: "5000" });
  await assert.rejects(fetchPlanUsage({ bin: makeStubClaude(dir), env, cwd: dir, timeoutMs: 300 }), /geen antwoord/);
});
