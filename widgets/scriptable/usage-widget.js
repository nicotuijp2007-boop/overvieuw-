// Limieten: home-screen and lock-screen widget for the usage dashboard, for the Scriptable app (iOS).
//
// Paste this whole file into a new script in Scriptable, run it once in the app to enter the
// dashboard URL and the widget token (stored in Scriptable's Keychain), then add a Scriptable
// widget and choose this script. See README: "Widget op iPhone en Mac".
//
// Data: GET <dashboard>/api/widget with "Authorization: Bearer <WIDGET_TOKEN>"
// (docs/prompts/widget-api-contract.md, version 1).
//
// Structure: pure functions first (response -> view model, Dutch texts, formatting), tested with
// Node in usage-widget.test.mjs; then a thin rendering layer and main() that use Scriptable's APIs.

// ---------------------------------------------------------------------------------------------
// Pure logic (no Scriptable APIs)
// ---------------------------------------------------------------------------------------------

const API_VERSION = 1;
const REFRESH_MINUTES = 15;
const KEY_URL = "limieten.dashboardUrl";
const KEY_TOKEN = "limieten.widgetToken";
const CACHE_FILE = "limieten-widget-cache.json";
const LOCALE = "nl-NL";

/** Rows per widget size. Large shows all limits up to this many, then "+N meer". */
const MAX_ROWS = { small: 1, medium: 3, large: 7, extraLarge: 7, accessoryRectangular: 1, accessoryCircular: 1 };

const LEVELS = {
  ok: { label: "OK", symbol: "checkmark.circle.fill" },
  warn: { label: "Let op", symbol: "exclamationmark.circle.fill" },
  danger: { label: "Kritiek", symbol: "xmark.circle.fill" },
};

/** [light, dark] hex pairs, from the dashboard's palette (src/app/globals.css). */
const PALETTE = {
  background: ["#fcfcfb", "#1a1a19"],
  text: ["#0b0b0b", "#f0efec"],
  secondary: ["#52514e", "#c3c2b7"],
  muted: ["#6f6d68", "#9a988f"],
  // Status colors only for icons and bars, never for text.
  ok: ["#0ca30c", "#0ca30c"],
  warn: ["#fab219", "#fab219"],
  danger: ["#d03b3b", "#d03b3b"],
  // OK bars are muted gray-green, so only Let op / Kritiek draw the eye (as on the dashboard).
  okBar: ["#78a46e", "#4f7a47"],
  okTrack: ["#e9e8e2", "#2a2a28"],
  warnTrack: ["#fdf0d1", "#3d3218"],
  dangerTrack: ["#f8e2e2", "#3a1f1f"],
};

const BAR = { ok: ["okBar", "okTrack"], warn: ["warn", "warnTrack"], danger: ["danger", "dangerTrack"] };

/** "https://x.netlify.app/" -> "https://x.netlify.app". Null when it isn't an http(s) URL. */
function normalizeUrl(input) {
  let s = String(input == null ? "" : input).trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  const m = /^(https?):\/\/([^/?#\s]+)(\/[^?#\s]*)?$/i.exec(s);
  if (!m) return null;
  const path = (m[3] || "").replace(/\/+$/, "");
  return `${m[1].toLowerCase()}://${m[2]}${path}`;
}

function widgetEndpoint(dashboardUrl) {
  return `${dashboardUrl}/api/widget`;
}

/** Throws when the response isn't something this script understands. */
function parseResponse(json) {
  if (!json || typeof json !== "object") throw new Error("Onverwacht antwoord van het dashboard.");
  if (json.version !== API_VERSION) throw new Error(`Onbekende API-versie (${json.version}). Werk het script bij.`);
  if (!Array.isArray(json.limits)) throw new Error("Onverwacht antwoord: geen limieten.");
  return json;
}

/** "Netlify (Free)" -> "Netlify": the plan name doesn't fit in a widget. */
function shortService(name) {
  return String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim() || String(name || "");
}

function limitTitle(limit) {
  return `${shortService(limit.serviceName)} · ${limit.metric}`;
}

function levelOf(limit) {
  return LEVELS[limit.level] ? limit.level : "ok";
}

/** "14:02" today, "10 nov 14:02" on another day; in the device's time zone (or `timeZone`). */
function formatClock(iso, now, timeZone) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opts = timeZone ? { timeZone } : {};
  const time = d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", ...opts });
  const day = (t) => new Date(t).toLocaleDateString(LOCALE, opts);
  if (day(d) === day(now)) return time;
  return `${d.toLocaleDateString(LOCALE, { day: "numeric", month: "short", ...opts }).replace(".", "")} ${time}`;
}

/** Footer text: "Bijgewerkt 14:02", or "niet ververst · 14:02" when showing the cache. */
function freshnessText(generatedAt, stale, now, timeZone) {
  const t = formatClock(generatedAt, now, timeZone);
  return stale ? `niet ververst · ${t}` : `Bijgewerkt ${t}`;
}

/** One row of the widget: everything a renderer needs, already in Dutch. */
function rowModel(limit, stale) {
  const level = levelOf(limit);
  const leftPct = Math.max(0, Math.min(100, Math.round(Number(limit.leftPct) || 0)));
  return {
    id: limit.id,
    title: limitTitle(limit),
    service: shortService(limit.serviceName),
    metric: limit.metric,
    leftPct,
    pctText: `${leftPct}%`,
    leftText: limit.leftText || `${leftPct}% over`,
    level,
    label: LEVELS[level].label,
    symbol: LEVELS[level].symbol,
    // The urgency is computed by the server at generatedAt; from the cache it may be out of date.
    urgency: stale ? null : limit.urgency || null,
    stale: Boolean(limit.stale),
  };
}

/**
 * The response as a view model for one widget size.
 * `opts.stale`: showing the cached response because the refresh failed.
 */
function buildView(data, family, opts) {
  const o = opts || {};
  const now = o.now == null ? Date.now() : o.now;
  const stale = Boolean(o.stale);
  const max = MAX_ROWS[family] || MAX_ROWS.medium;
  const rows = data.limits.map((l) => rowModel(l, stale));
  const summary = data.summary || {};
  const problems = Array.isArray(data.problems) ? data.problems : [];
  return {
    kind: "limits",
    family,
    headline: summary.headline || (rows.length ? "" : "Nog geen limieten."),
    counts: { ok: summary.ok || 0, warn: summary.warn || 0, danger: summary.danger || 0 },
    rows: rows.slice(0, max),
    more: Math.max(rows.length - max, 0),
    stale,
    footer: freshnessText(data.generatedAt, stale, now, o.timeZone),
    problemsText: problems.length ? `${problems.map((p) => shortService(p.name)).join(", ")} niet ververst` : null,
    url: o.url || data.dashboardUrl || null,
  };
}

/** A short Dutch reason for a failed refresh. `err.status` is the HTTP status, if any. */
function describeError(err) {
  const status = err && err.status;
  if (status === 401) return "Token onjuist. Open Scriptable om hem te wijzigen.";
  if (status === 503) return "WIDGET_TOKEN ontbreekt op de server.";
  if (status) return `Dashboard gaf fout ${status}.`;
  const msg = String((err && err.message) || "");
  if (/offline|network|internet|connection|verbinding|timed out|time-out|timeout/i.test(msg)) return "Geen verbinding met het dashboard.";
  return msg || "Onbekende fout.";
}

/** Shown when there's neither fresh data nor a cache. */
function errorView(err, url) {
  return { kind: "error", title: "Kan limieten niet laden", message: describeError(err), url: url || null };
}

function setupView() {
  return {
    kind: "setup",
    title: "Nog niet ingesteld",
    message: "Open Scriptable en start dit script om de dashboard-URL en token in te vullen.",
    url: null,
  };
}

function nextRefresh(now) {
  return new Date(now + REFRESH_MINUTES * 60_000);
}

// ---------------------------------------------------------------------------------------------
// Scriptable glue (thin)
// ---------------------------------------------------------------------------------------------

function color(name) {
  const [light, dark] = PALETTE[name];
  return Color.dynamic(new Color(light), new Color(dark));
}

function isAccessory(family) {
  return String(family || "").startsWith("accessory");
}

function addText(stack, text, font, colorName, lines) {
  const t = stack.addText(text);
  t.font = font;
  t.textColor = color(colorName);
  if (lines) t.lineLimit = lines;
  t.minimumScaleFactor = 0.75;
  return t;
}

function addSymbol(stack, row, size, mono) {
  const sym = SFSymbol.named(row.symbol);
  sym.applyFont(Font.systemFont(size));
  const img = stack.addImage(sym.image);
  img.imageSize = new Size(size, size);
  img.tintColor = mono ? Color.white() : color(row.level);
  return img;
}

/** A thin meter of what's left: the fill is the remaining share. Built from stacks, so dark mode works. */
function addBar(stack, row, width, height) {
  const [fill, track] = BAR[row.level];
  const bar = stack.addStack();
  bar.size = new Size(width, height);
  bar.cornerRadius = height / 2;
  bar.backgroundColor = color(track);
  bar.layoutHorizontally();
  const w = row.leftPct > 0 ? Math.max((width * row.leftPct) / 100, height) : 0;
  if (w > 0) {
    const f = bar.addStack();
    f.size = new Size(w, height);
    f.cornerRadius = height / 2;
    f.backgroundColor = color(fill);
  }
  bar.addSpacer();
  return bar;
}

function renderSmall(w, v) {
  const r = v.rows[0];
  if (!r) return renderMessage(w, { title: "Limieten", message: v.headline });
  const top = w.addStack();
  top.centerAlignContent();
  addSymbol(top, r, 16);
  top.addSpacer(5);
  addText(top, r.label, Font.semiboldSystemFont(14), "text", 1);
  w.addSpacer();
  const big = w.addStack();
  big.bottomAlignContent();
  addText(big, r.pctText, Font.boldRoundedSystemFont(36), "text", 1);
  big.addSpacer(3);
  addText(big, "over", Font.mediumSystemFont(14), "secondary", 1);
  addText(w, r.title, Font.semiboldSystemFont(12), "text", 2);
  if (r.urgency) {
    w.addSpacer(2);
    addText(w, r.urgency, Font.systemFont(11), "secondary", 2);
  }
  w.addSpacer(4);
  addText(w, v.footer, Font.systemFont(10), "muted", 1);
}

function addRow(w, r, barWidth) {
  const row = w.addStack();
  row.centerAlignContent();
  addSymbol(row, r, 14);
  row.addSpacer(6);
  addText(row, r.title + (r.stale ? " · niet ververst" : ""), Font.mediumSystemFont(13), "text", 1);
  // Flexible: pushes bar and % to the right edge, so they line up across rows.
  row.addSpacer();
  addBar(row, r, barWidth, 5);
  row.addSpacer(8);
  const pct = row.addStack();
  pct.size = new Size(40, 0);
  pct.addSpacer();
  addText(pct, r.pctText, Font.semiboldMonospacedSystemFont(13), "text", 1);
  return row;
}

function addHeader(w, v, withHeadline) {
  const head = w.addStack();
  head.centerAlignContent();
  addText(head, "Limieten", Font.boldSystemFont(14), "text", 1);
  head.addSpacer();
  addText(head, v.footer, Font.systemFont(11), "muted", 1);
  if (withHeadline && v.headline) {
    w.addSpacer(3);
    addText(w, v.headline, Font.systemFont(12), "secondary", 2);
  }
}

function renderMedium(w, v) {
  addHeader(w, v, false);
  w.addSpacer();
  v.rows.forEach((r, i) => {
    if (i) w.addSpacer(9);
    addRow(w, r, 64);
  });
  w.addSpacer();
  addText(w, "% over", Font.systemFont(10), "muted", 1).rightAlignText();
}

function renderLarge(w, v) {
  addHeader(w, v, true);
  w.addSpacer(12);
  v.rows.forEach((r, i) => {
    if (i) w.addSpacer(10);
    addRow(w, r, 80);
  });
  w.addSpacer();
  const foot = w.addStack();
  addText(foot, v.more ? `+${v.more} meer in het dashboard` : v.problemsText || "", Font.systemFont(10), "muted", 1);
  foot.addSpacer();
  addText(foot, "% over", Font.systemFont(10), "muted", 1);
}

function renderRectangular(w, v) {
  const r = v.rows[0];
  if (!r) return addText(w, v.headline || "Geen limieten", Font.systemFont(13), "text", 2);
  const top = w.addStack();
  top.centerAlignContent();
  addSymbol(top, r, 13, true);
  top.addSpacer(4);
  const t = top.addText(`${r.leftText}`);
  t.font = Font.boldSystemFont(15);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  const name = w.addText(r.title);
  name.font = Font.mediumSystemFont(12);
  name.lineLimit = 1;
  const line = w.addText(v.stale ? `${r.label} · ${v.footer}` : r.urgency ? `${r.label} · ${r.urgency}` : r.label);
  line.font = Font.systemFont(11);
  line.lineLimit = 1;
  line.minimumScaleFactor = 0.8;
}

function renderCircular(w, v) {
  w.addAccessoryWidgetBackground = true;
  const r = v.rows[0];
  if (!r) return;
  const col = w.addStack();
  col.layoutVertically();
  col.centerAlignContent();
  const icon = col.addStack();
  icon.addSpacer();
  addSymbol(icon, r, 12, true);
  icon.addSpacer();
  const pct = col.addStack();
  pct.addSpacer();
  const t = pct.addText(r.pctText);
  t.font = Font.boldRoundedSystemFont(17);
  t.minimumScaleFactor = 0.6;
  t.lineLimit = 1;
  pct.addSpacer();
  const lbl = col.addStack();
  lbl.addSpacer();
  const o = lbl.addText("over");
  o.font = Font.systemFont(9);
  lbl.addSpacer();
}

function renderMessage(w, m, family) {
  if (isAccessory(family)) {
    const t = w.addText(m.title);
    t.font = Font.semiboldSystemFont(12);
    t.lineLimit = 2;
    return;
  }
  const top = w.addStack();
  top.centerAlignContent();
  const sym = SFSymbol.named("exclamationmark.triangle.fill");
  sym.applyFont(Font.systemFont(14));
  const img = top.addImage(sym.image);
  img.imageSize = new Size(14, 14);
  img.tintColor = color("warn");
  top.addSpacer(5);
  addText(top, m.title, Font.semiboldSystemFont(13), "text", 2);
  w.addSpacer(6);
  addText(w, m.message, Font.systemFont(12), "secondary", 4);
  w.addSpacer();
}

/** Builds the ListWidget for a view model. */
function renderWidget(view, family, now) {
  const w = new ListWidget();
  if (!isAccessory(family)) {
    w.backgroundColor = color("background");
    w.setPadding(14, 14, 14, 14);
  }
  if (view.url) w.url = view.url;
  w.refreshAfterDate = nextRefresh(now);
  if (view.kind !== "limits") renderMessage(w, view, family);
  else if (family === "small") renderSmall(w, view);
  else if (family === "large" || family === "extraLarge") renderLarge(w, view);
  else if (family === "accessoryRectangular") renderRectangular(w, view);
  else if (family === "accessoryCircular") renderCircular(w, view);
  else renderMedium(w, view);
  return w;
}

// ---- Settings (Keychain) ---------------------------------------------------------------------

function readSettings() {
  const url = Keychain.contains(KEY_URL) ? Keychain.get(KEY_URL) : null;
  const token = Keychain.contains(KEY_TOKEN) ? Keychain.get(KEY_TOKEN) : null;
  return url && token ? { url, token } : null;
}

function clearSettings() {
  if (Keychain.contains(KEY_URL)) Keychain.remove(KEY_URL);
  if (Keychain.contains(KEY_TOKEN)) Keychain.remove(KEY_TOKEN);
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
  if (fm.fileExists(path)) fm.remove(path);
}

async function info(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction("OK");
  await a.presentAlert();
}

/** Asks for the URL and token. Returns true when saved. An empty token keeps the current one. */
async function askSettings(current) {
  for (;;) {
    const a = new Alert();
    a.title = "Limieten instellen";
    a.message = current
      ? "Wijzig de dashboard-URL of plak een nieuwe widgettoken. Laat de token leeg om hem te houden."
      : "Vul de URL van je dashboard en de widgettoken (WIDGET_TOKEN) in. Ze worden bewaard in de sleutelhanger van Scriptable.";
    a.addTextField("https://jouw-site.netlify.app", current ? current.url : "");
    a.addSecureTextField(current ? "Token (leeg = ongewijzigd)" : "Widgettoken", "");
    a.addAction("Opslaan");
    if (current) a.addDestructiveAction("Wissen");
    a.addCancelAction("Annuleren");
    const choice = await a.presentAlert();
    if (choice === -1) return false;
    if (current && choice === 1) {
      clearSettings();
      await info("Gewist", "De URL, de token en de bewaarde gegevens zijn verwijderd.");
      return false;
    }
    const url = normalizeUrl(a.textFieldValue(0));
    const token = a.textFieldValue(1).trim() || (current ? current.token : "");
    if (!url) {
      await info("Ongeldige URL", "Vul een adres in als https://jouw-site.netlify.app.");
      continue;
    }
    if (!token) {
      await info("Token ontbreekt", "Plak de waarde van WIDGET_TOKEN uit Netlify.");
      continue;
    }
    Keychain.set(KEY_URL, url);
    Keychain.set(KEY_TOKEN, token);
    return true;
  }
}

// ---- Data (network + cache) ------------------------------------------------------------------

async function fetchData(settings) {
  const req = new Request(widgetEndpoint(settings.url));
  req.headers = { Authorization: `Bearer ${settings.token}`, Accept: "application/json" };
  req.timeoutInterval = 15;
  const json = await req.loadJSON();
  const status = req.response && req.response.statusCode;
  if (status !== 200) {
    const err = new Error((json && json.error) || `HTTP ${status}`);
    err.status = status;
    throw err;
  }
  return parseResponse(json);
}

function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
}

function readCache() {
  try {
    const fm = FileManager.local();
    const path = cachePath();
    if (!fm.fileExists(path)) return null;
    return parseResponse(JSON.parse(fm.readString(path)));
  } catch (e) {
    return null;
  }
}

function writeCache(data) {
  try {
    FileManager.local().writeString(cachePath(), JSON.stringify(data));
  } catch (e) {
    // A full disk shouldn't break the widget.
  }
}

/** Fresh data, or the cache marked stale, or an error. Never throws. */
async function load(settings) {
  try {
    const data = await fetchData(settings);
    writeCache(data);
    return { data, stale: false, error: null };
  } catch (error) {
    const cached = readCache();
    return { data: cached, stale: Boolean(cached), error };
  }
}

async function viewFor(settings, family, now) {
  if (!settings) return setupView();
  const res = await load(settings);
  if (!res.data) return errorView(res.error, settings.url);
  return buildView(res.data, family, { now, stale: res.stale, url: settings.url });
}

// ---- Entry point -----------------------------------------------------------------------------

async function main() {
  const now = Date.now();
  if (config.runsInWidget || config.runsInAccessoryWidget) {
    const family = config.widgetFamily || "medium";
    const view = await viewFor(readSettings(), family, now);
    Script.setWidget(renderWidget(view, family, now));
    Script.complete();
    return;
  }

  // In the app: set up on first run, then a small menu.
  let settings = readSettings();
  if (!settings) {
    if (!(await askSettings(null))) return Script.complete();
    settings = readSettings();
  }
  const menu = new Alert();
  menu.title = "Limieten";
  menu.message = settings.url;
  ["Voorbeeld klein", "Voorbeeld middel", "Voorbeeld groot", "Dashboard openen", "Instellingen wijzigen of wissen"].forEach((t) =>
    menu.addAction(t),
  );
  menu.addCancelAction("Sluiten");
  const choice = await menu.presentSheet();
  if (choice >= 0 && choice <= 2) {
    const family = ["small", "medium", "large"][choice];
    const view = await viewFor(settings, family, now);
    const w = renderWidget(view, family, now);
    await (family === "small" ? w.presentSmall() : family === "large" ? w.presentLarge() : w.presentMedium());
  } else if (choice === 3) {
    Safari.open(settings.url);
  } else if (choice === 4) {
    await askSettings(settings);
  }
  Script.complete();
}

// For the Node tests (usage-widget.test.mjs). Scriptable has `module` too; this is harmless there.
if (typeof module !== "undefined") {
  module.exports = {
    API_VERSION, MAX_ROWS, LEVELS, PALETTE,
    normalizeUrl, widgetEndpoint, parseResponse, shortService, limitTitle, formatClock, freshnessText,
    rowModel, buildView, describeError, errorView, setupView, nextRefresh, renderWidget, main,
  };
}

if (!globalThis.__LIMIETEN_SKIP_MAIN__) await main();
