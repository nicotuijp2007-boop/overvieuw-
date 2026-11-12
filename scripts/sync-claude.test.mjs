/**
 * End to end: runs a copy of the sync (as the background job does) against a local stand-in
 * for the dashboard, with a fake `claude` and fake Claude Code logs.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { makeStubClaude, SESSION_RESETS, usageOutput } from "./lib/test-fixtures.mjs";

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const posts = [];
let server;
let url;

before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      posts.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

/** A copy of the sync scripts with fake logs and a fake claude, like the installed job. */
function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), "sync-e2e-"));
  for (const f of ["sync-claude.mjs", "lib/claude-logs.mjs", "lib/plan-usage.mjs"]) {
    mkdirSync(path.dirname(path.join(root, "scripts", f)), { recursive: true });
    copyFileSync(path.join(SCRIPTS, f), path.join(root, "scripts", f));
  }
  const now = new Date().toISOString();
  const logs = path.join(root, "claude-home", "projects", "-Users-me-myapp");
  mkdirSync(logs, { recursive: true });
  const line = (o) => JSON.stringify({ type: "assistant", timestamp: now, sessionId: "sess-1", cwd: "/Users/me/myapp", ...o });
  const real = { requestId: "req_1", message: { id: "msg_1", model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 } } };
  writeFileSync(
    path.join(logs, "sess-1.jsonl"),
    [
      line(real),
      line(real), // Claude Code writes the same response more than once
      line({ message: { id: "syn_1", model: "<synthetic>", usage: { input_tokens: 0, output_tokens: 0 } } }),
    ].join("\n") + "\n",
  );
  return { root, bin: makeStubClaude(), out: path.join(root, "stub-out.jsonl"), record: path.join(root, "stub-record.jsonl") };
}

function run(s, { out = usageOutput(), args = ["--usage"] } = {}) {
  writeFileSync(s.out, out);
  const env = {
    ...process.env,
    DASHBOARD_URL: url,
    INGEST_SECRET: "test-secret",
    MACHINE_NAME: "test-mac",
    CLAUDE_BIN: s.bin,
    CLAUDE_CONFIG_DIR: path.join(s.root, "claude-home"),
    STUB_OUT: s.out,
    STUB_RECORD: s.record,
  };
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(s.root, "scripts", "sync-claude.mjs"), ...args], { env }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr }),
    );
  });
}

const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const stubRuns = (s) => (existsSync(s.record) ? readFileSync(s.record, "utf8").trim().split("\n").length : 0);

test("--usage sends fresh plan limits and the token usage in one request", async () => {
  const s = setup();
  posts.length = 0;
  const r = await run(s);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /sessie 23%, week 41%, via \/usage/);

  assert.equal(posts.length, 1);
  const { path: p, auth, body } = posts[0];
  assert.equal(p, "/api/ingest/claude");
  assert.equal(auth, "Bearer test-secret");
  assert.equal(body.machine, "test-mac");
  assert.equal(body.rateLimits.fiveHour.pct, 23.4);
  assert.equal(body.rateLimits.fiveHour.resetsAt, SESSION_RESETS);
  assert.equal(body.rateLimits.sevenDay.pct, 41.2);
  assert.ok(Date.now() - Date.parse(body.rateLimits.recordedAt) < 60_000);
  // One response: the duplicate is merged and the synthetic message isn't counted.
  assert.equal(body.usage.length, 1);
  assert.deepEqual(
    { project: body.usage[0].project, responses: body.usage[0].responses, input: body.usage[0].input, models: body.usage[0].models },
    { project: "myapp", responses: 1, input: 10, models: ["claude-opus-5-5"] },
  );

  const status = json(path.join(s.root, "data", "last-sync.json"));
  assert.equal(status.ok, true);
  assert.equal(status.plan.sevenDay.usedPercentage, 41.2);
  assert.equal(json(path.join(s.root, "data", "claude-rate-limits.json")).source, "usage");
});

test("without --usage nothing runs claude (status line mode)", async () => {
  const s = setup();
  posts.length = 0;
  const r = await run(s, { args: ["--quiet"] });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(stubRuns(s), 0);
  assert.equal(posts[0].body.rateLimits, null);
});

test("when /usage fails, the token usage is still sent and the error is kept for `status`", async () => {
  const s = setup();
  posts.length = 0;
  const r = await run(s, { out: usageOutput({ withReport: false, text: "Not logged in · Please run /login", isError: true }) });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Token usage sent, but not the plan usage: .*Not logged in/);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.usage.length, 1);
  const status = json(path.join(s.root, "data", "last-sync.json"));
  assert.equal(status.ok, false);
  assert.match(status.error, /claude auth login/);
});

test("a run that made a model request turns /usage off until the next install", async () => {
  const s = setup();
  const r1 = await run(s, { out: usageOutput({ withReport: false, text: "OK", usage: { input_tokens: 9, output_tokens: 1 } }) });
  assert.equal(r1.code, 1);
  assert.ok(existsSync(path.join(s.root, "data", "usage-disabled")));
  const r2 = await run(s);
  assert.equal(r2.code, 1);
  assert.match(r2.stderr, /Uitgezet/);
  assert.equal(stubRuns(s), 1, "claude must not run again");
});
