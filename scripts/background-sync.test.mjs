import assert from "node:assert/strict";
import { test } from "node:test";
import { cronLine, LABEL, parseEnv, plistXml } from "./background-sync.mjs";

test("the LaunchAgent runs the sync with --usage every N minutes and once at load", () => {
  const xml = plistXml({
    node: "/opt/homebrew/bin/node",
    script: "/Users/me/Library/Application Support/usage-dashboard-sync/scripts/sync-claude.mjs",
    cwd: "/Users/me/Library/Application Support/usage-dashboard-sync",
    minutes: 5,
    logPath: "/Users/me/Library/Logs/usage-dashboard-sync.log",
    path: "/opt/homebrew/bin:/usr/bin:/bin",
  });
  assert.match(xml, new RegExp(`<key>Label</key><string>${LABEL}</string>`));
  assert.match(xml, /<array><string>\/opt\/homebrew\/bin\/node<\/string><string>\/Users\/me\/Library\/Application Support\/usage-dashboard-sync\/scripts\/sync-claude.mjs<\/string><string>--usage<\/string><string>--quiet<\/string><\/array>/);
  assert.match(xml, /<key>StartInterval<\/key><integer>300<\/integer>/);
  assert.match(xml, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(xml, /<key>USAGE_SYNC_LOG<\/key><string>\/Users\/me\/Library\/Logs\/usage-dashboard-sync.log<\/string>/);
});

test("paths are escaped for XML", () => {
  const xml = plistXml({ node: "/a&b/node", script: "/x<y>/s.mjs", cwd: "/c", minutes: 2, logPath: "/l", path: "/p" });
  assert.match(xml, /<string>\/a&amp;b\/node<\/string>/);
  assert.match(xml, /<string>\/x&lt;y&gt;\/s.mjs<\/string>/);
  assert.match(xml, /<integer>120<\/integer>/);
});

test("the cron line quotes paths for the shell", () => {
  assert.equal(
    cronLine({ node: "/usr/bin/node", script: "/home/me/my repo/scripts/sync-claude.mjs", minutes: 5, claude: "/home/me/.local/bin/claude", logPath: "/home/me/.cache/x.log" }),
    "*/5 * * * * CLAUDE_BIN='/home/me/.local/bin/claude' '/usr/bin/node' '/home/me/my repo/scripts/sync-claude.mjs' --usage --quiet >> '/home/me/.cache/x.log' 2>&1",
  );
  assert.match(cronLine({ node: "/n", script: "/it's/s.mjs", minutes: 10, claude: "/c", logPath: "/l" }), /'\/it'\\''s\/s.mjs'/);
});

test("reads .env.local like the sync does", () => {
  assert.deepEqual(parseEnv("# comment\nDASHBOARD_URL=https://x.netlify.app\nINGEST_SECRET = 'abc'\nMACHINE_NAME=\"laptop\"\n"), {
    DASHBOARD_URL: "https://x.netlify.app",
    INGEST_SECRET: "abc",
    MACHINE_NAME: "laptop",
  });
});
