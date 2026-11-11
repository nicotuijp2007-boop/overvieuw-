// Node tests for the Scriptable widget: node --test widgets/scriptable/
// Loads usage-widget.js with stubbed Scriptable globals (dev/scriptable-stubs.mjs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runScript } from "./dev/scriptable-stubs.mjs";

const fixture = JSON.parse(readFileSync(new URL("./dev/fixture.json", import.meta.url), "utf8"));
const TZ = "Europe/Amsterdam";
const NOW = Date.parse("2026-11-11T13:20:00Z");
const URL_ = "https://usage-dashboard-e00568.netlify.app";
const TOKEN = "test-token";
const SETTINGS = { "limieten.dashboardUrl": URL_, "limieten.widgetToken": TOKEN };
const CACHE = "/docs/limieten-widget-cache.json";

const { exports: w } = await runScript({ skipMain: true });

/** All texts in a recorded widget tree, in order. */
function texts(node) {
  const out = node.type === "text" ? [node.text] : [];
  for (const c of node.children ?? []) out.push(...texts(c));
  return out;
}
function find(node, pred) {
  return [...(pred(node) ? [node] : []), ...(node.children ?? []).flatMap((c) => find(c, pred))];
}

test("normalizeUrl accepts host names and strips trailing slashes", () => {
  assert.equal(w.normalizeUrl(" https://x.netlify.app/ "), "https://x.netlify.app");
  assert.equal(w.normalizeUrl("x.netlify.app"), "https://x.netlify.app");
  assert.equal(w.normalizeUrl("HTTP://localhost:3000//"), "http://localhost:3000");
  assert.equal(w.normalizeUrl("https://x.app/sub/"), "https://x.app/sub");
  assert.equal(w.normalizeUrl(""), null);
  assert.equal(w.normalizeUrl("ftp://x.app"), null);
  assert.equal(w.normalizeUrl("https://x.app?token=1"), null);
  assert.equal(w.widgetEndpoint("https://x.app"), "https://x.app/api/widget");
});

test("parseResponse checks the contract version", () => {
  assert.equal(w.parseResponse(fixture), fixture);
  assert.throws(() => w.parseResponse({ ...fixture, version: 2 }), /API-versie/);
  assert.throws(() => w.parseResponse({ version: 1 }), /geen limieten/);
  assert.throws(() => w.parseResponse(null));
});

test("shortService drops the plan name", () => {
  assert.equal(w.shortService("Netlify (Free)"), "Netlify");
  assert.equal(w.shortService("Claude (Pro)"), "Claude");
  assert.equal(w.shortService("Handmatig"), "Handmatig");
});

test("times are Dutch, in the given time zone", () => {
  assert.equal(w.formatClock("2026-11-11T13:09:00Z", NOW, TZ), "14:09");
  assert.equal(w.formatClock("2026-11-10T13:09:00Z", NOW, TZ), "10 nov 14:09");
  assert.equal(w.freshnessText("2026-11-11T13:09:00Z", false, NOW, TZ), "Bijgewerkt 14:09");
  assert.equal(w.freshnessText("2026-11-11T13:09:00Z", true, NOW, TZ), "niet ververst · 14:09");
});

test("rowModel: what's left, status as icon + word", () => {
  const r = w.rowModel(fixture.limits[0], false);
  assert.equal(r.title, "Claude · Sessie (5 uur)");
  assert.equal(r.pctText, "27%");
  assert.equal(r.leftText, "27% over");
  assert.equal(r.level, "warn");
  assert.equal(r.label, "Let op");
  assert.equal(r.symbol, "exclamationmark.circle.fill");
  assert.match(r.urgency, /^Op over ~/);
  const danger = w.rowModel(fixture.limits[1], false);
  assert.deepEqual([danger.label, danger.symbol], ["Kritiek", "xmark.circle.fill"]);
  const ok = w.rowModel(fixture.limits[2], false);
  assert.deepEqual([ok.label, ok.symbol], ["OK", "checkmark.circle.fill"]);
  // From the cache, the server's urgency may be outdated: don't show it.
  assert.equal(w.rowModel(fixture.limits[0], true).urgency, null);
  // Out-of-range values are clamped, unknown levels fall back to OK.
  assert.equal(w.rowModel({ ...fixture.limits[0], leftPct: -5, level: "??" }, false).pctText, "0%");
  assert.equal(w.rowModel({ ...fixture.limits[0], level: "??" }, false).label, "OK");
});

test("buildView picks the most urgent limits per size, in the server's order", () => {
  const small = w.buildView(fixture, "small", { now: NOW, timeZone: TZ });
  assert.deepEqual(small.rows.map((r) => r.id), ["claude|Sessie (5 uur)"]);
  const medium = w.buildView(fixture, "medium", { now: NOW, timeZone: TZ });
  assert.deepEqual(medium.rows.map((r) => r.id), fixture.limits.slice(0, 3).map((l) => l.id));
  assert.equal(medium.more, fixture.limits.length - 3);
  const large = w.buildView(fixture, "large", { now: NOW, timeZone: TZ });
  assert.equal(large.rows.length, fixture.limits.length);
  assert.equal(large.more, 0);
  assert.equal(large.headline, fixture.summary.headline);
  assert.equal(large.footer, "Bijgewerkt 14:09");
  assert.equal(large.problemsText, "Supabase niet ververst");
  assert.equal(large.url, fixture.dashboardUrl);
  const many = { ...fixture, limits: Array.from({ length: 10 }, (_, i) => ({ ...fixture.limits[2], id: `x|${i}` })) };
  const big = w.buildView(many, "large", { now: NOW });
  assert.equal(big.rows.length, 7);
  assert.equal(big.more, 3);
  const empty = w.buildView({ ...fixture, limits: [], summary: {} }, "small", { now: NOW });
  assert.equal(empty.headline, "Nog geen limieten.");
});

test("describeError gives a short Dutch reason", () => {
  assert.match(w.describeError({ status: 401 }), /Token onjuist/);
  assert.match(w.describeError({ status: 503 }), /WIDGET_TOKEN/);
  assert.equal(w.describeError({ status: 500 }), "Dashboard gaf fout 500.");
  assert.equal(w.describeError(new Error("The Internet connection appears to be offline.")), "Geen verbinding met het dashboard.");
  assert.equal(w.describeError(new Error("The request timed out.")), "Geen verbinding met het dashboard.");
});

test("nextRefresh is 15 minutes later", () => {
  assert.equal(w.nextRefresh(NOW).getTime() - NOW, 15 * 60_000);
});

// ---- The whole script, as Scriptable would run it ------------------------------------------

const ok = (json = fixture) => async () => ({ status: 200, json });

for (const family of ["small", "medium", "large", "accessoryRectangular", "accessoryCircular"]) {
  test(`widget (${family}) renders fresh data and caches it`, async () => {
    const { state } = await runScript({
      config: { runsInWidget: !family.startsWith("accessory"), runsInAccessoryWidget: family.startsWith("accessory"), widgetFamily: family },
      keychain: SETTINGS,
      respond: ok(),
    });
    assert.ok(state.completed);
    const req = state.requests[0];
    assert.equal(req.url, `${URL_}/api/widget`);
    assert.equal(req.headers.Authorization, `Bearer ${TOKEN}`);
    assert.ok(!req.url.includes(TOKEN), "token never in the URL");
    const tree = state.widget;
    assert.equal(tree.url, URL_);
    const inMin = (tree.refreshAfterDate.getTime() - Date.now()) / 60_000;
    assert.ok(inMin > 14 && inMin <= 15, `refresh in ~15 min, got ${inMin}`);
    assert.ok(JSON.parse(state.files.get(CACHE)).version === 1, "cached");
    const all = texts(tree);
    assert.ok(all.some((t) => t.startsWith("27%")), `shows 27% left: ${all}`);
    // Status icons are SF Symbols.
    const symbols = find(tree, (n) => n.type === "image").map((n) => n.image.symbol);
    assert.ok(symbols.includes("exclamationmark.circle.fill"));
    if (family === "small") assert.ok(all.includes("Let op") && all.includes("over"));
    if (family === "medium") assert.equal(symbols.length, 3);
    if (family === "large") {
      assert.equal(symbols.length, fixture.limits.length);
      assert.ok(all.includes(fixture.summary.headline));
      assert.ok(all.some((t) => /^Bijgewerkt \d\d:\d\d$/.test(t)));
      assert.ok(all.some((t) => t.includes("niet ververst")), "stale limit marked");
    }
    if (family === "accessoryCircular") assert.ok(tree.addAccessoryWidgetBackground);
  });
}

test("text never uses a status color; bars and icons do", async () => {
  const { state } = await runScript({ config: { runsInWidget: true, widgetFamily: "large" }, keychain: SETTINGS, respond: ok() });
  const status = new Set(["#0ca30c", "#fab219", "#d03b3b"]);
  for (const t of find(state.widget, (n) => n.type === "text")) {
    assert.ok(t.textColor && !status.has(t.textColor.light.hex) && !status.has(t.textColor.dark.hex), `text "${t.text}" in a status color`);
  }
  const tints = find(state.widget, (n) => n.type === "image").map((n) => n.tintColor.light.hex);
  assert.ok(tints.includes("#fab219") && tints.includes("#d03b3b") && tints.includes("#0ca30c"));
  // OK bars use the muted gray-green, light and dark.
  const fills = find(state.widget, (n) => n.type === "stack" && n.backgroundColor?.light).map((n) => n.backgroundColor);
  assert.ok(fills.some((c) => c.light.hex === "#78a46e" && c.dark.hex === "#4f7a47"));
});

test("on a failed refresh the widget shows the cache, marked 'niet ververst'", async () => {
  const { state } = await runScript({
    config: { runsInWidget: true, widgetFamily: "medium" },
    keychain: SETTINGS,
    files: { [CACHE]: JSON.stringify(fixture) },
    respond: async () => {
      throw new Error("The Internet connection appears to be offline.");
    },
  });
  const all = texts(state.widget);
  assert.ok(all.some((t) => /^niet ververst · /.test(t)), all.join(" | "));
  assert.ok(all.includes("27%"));
});

test("a wrong token without cache gives a clear error state", async () => {
  const { state } = await runScript({
    config: { runsInWidget: true, widgetFamily: "small" },
    keychain: SETTINGS,
    respond: async () => ({ status: 401, json: { error: "Unauthorized" } }),
  });
  const all = texts(state.widget);
  assert.deepEqual(all, ["Kan limieten niet laden", "Token onjuist. Open Scriptable om hem te wijzigen."]);
  assert.equal(state.widget.url, URL_);
});

test("an unknown API version is not cached and falls back to the cache", async () => {
  const { state } = await runScript({
    config: { runsInWidget: true, widgetFamily: "small" },
    keychain: SETTINGS,
    files: { [CACHE]: JSON.stringify(fixture) },
    respond: ok({ ...fixture, version: 2 }),
  });
  assert.equal(JSON.parse(state.files.get(CACHE)).version, 1);
  assert.ok(texts(state.widget).some((t) => t.startsWith("niet ververst")));
});

test("without settings the widget asks to open Scriptable and makes no request", async () => {
  const { state } = await runScript({ config: { runsInWidget: true, widgetFamily: "medium" }, respond: ok() });
  assert.equal(state.requests.length, 0);
  assert.equal(texts(state.widget)[0], "Nog niet ingesteld");
});

test("first run in the app asks for URL and token and stores them in the Keychain", async () => {
  const { state } = await runScript({
    config: { runsInApp: true },
    respond: ok(),
    alertAnswers: [
      { choice: 0, fields: ["usage-dashboard-e00568.netlify.app/", " secret-token "] }, // settings
      { choice: 1 }, // menu: medium preview
    ],
  });
  assert.equal(state.keychain.get("limieten.dashboardUrl"), URL_);
  assert.equal(state.keychain.get("limieten.widgetToken"), "secret-token");
  assert.ok(state.alerts[0].fields[1].secure, "token field is secure");
  assert.equal(state.presented, "medium");
  assert.equal(state.requests[0].headers.Authorization, "Bearer secret-token");
});

test("an invalid URL is asked again", async () => {
  const { state } = await runScript({
    config: { runsInApp: true },
    alertAnswers: [
      { choice: 0, fields: ["ftp://nope", "t"] },
      { choice: 0 }, // "Ongeldige URL" info
      { choice: 0, fields: [URL_, "t"] },
      { choice: -1 }, // close the menu
    ],
  });
  assert.equal(state.alerts[1].title, "Ongeldige URL");
  assert.equal(state.keychain.get("limieten.dashboardUrl"), URL_);
});

test("the settings option keeps the token when left empty, and can wipe everything", async () => {
  const kept = await runScript({
    config: { runsInApp: true },
    keychain: SETTINGS,
    alertAnswers: [{ choice: 4 }, { choice: 0, fields: ["https://other.app", ""] }],
  });
  assert.equal(kept.state.keychain.get("limieten.dashboardUrl"), "https://other.app");
  assert.equal(kept.state.keychain.get("limieten.widgetToken"), TOKEN);
  assert.equal(kept.state.alerts[1].fields[1].text, "", "the stored token is never prefilled");

  const wiped = await runScript({
    config: { runsInApp: true },
    keychain: SETTINGS,
    files: { [CACHE]: "{}" },
    alertAnswers: [{ choice: 4 }, { choice: 1 }, { choice: 0 }],
  });
  assert.equal(wiped.state.keychain.size, 0);
  assert.equal(wiped.state.files.has(CACHE), false);
});

test("the menu can open the dashboard", async () => {
  const { state } = await runScript({ config: { runsInApp: true }, keychain: SETTINGS, alertAnswers: [{ choice: 3 }] });
  assert.deepEqual(state.opened, [URL_]);
});
