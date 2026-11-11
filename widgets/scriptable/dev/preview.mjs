// Renders the widget as Scriptable would build it (via the stubs) into an approximate HTML mock,
// in light and dark mode, for every size. Only for looking at the layout; the real rendering
// happens in Scriptable (SwiftUI), so spacing and fonts differ a little.
//
//   node widgets/scriptable/dev/preview.mjs [fixture.json] > preview.html
import { readFileSync } from "node:fs";
import { runScript } from "./scriptable-stubs.mjs";

const fixturePath = process.argv[2] ?? new URL("./fixture.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const URL_ = "https://usage-dashboard-e00568.netlify.app";
const SETTINGS = { "limieten.dashboardUrl": URL_, "limieten.widgetToken": "preview" };

// iPhone 15 Pro sizes, in points.
const SIZES = {
  small: [170, 170],
  medium: [364, 170],
  large: [364, 382],
  accessoryRectangular: [172, 76],
  accessoryCircular: [76, 76],
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function colorOf(c, dark) {
  if (!c) return null;
  const x = c.light ? (dark ? c.dark : c.light) : c;
  return x.hex;
}

function fontCss(f) {
  if (!f) return "font-size:13px;";
  const n = f.name.toLowerCase();
  const weight = n.includes("bold") ? 700 : n.includes("semibold") ? 600 : n.includes("medium") ? 500 : 400;
  const family = n.includes("rounded") ? "ui-rounded, 'SF Pro Rounded', system-ui" : "system-ui, -apple-system, sans-serif";
  return `font-size:${f.size}px;font-weight:${weight};font-family:${family};font-variant-numeric:tabular-nums;`;
}

function symbolSvg(name, size, color, markColor = "#fff") {
  const mark = name.startsWith("checkmark")
    ? `<path d="M4.5 8.2 7 10.6l4.6-5" stroke="${markColor}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : name.startsWith("xmark")
      ? `<path d="m5.3 5.3 5.4 5.4m0-5.4-5.4 5.4" stroke="${markColor}" stroke-width="1.8" stroke-linecap="round"/>`
      : `<path d="M8 4v5" stroke="${markColor}" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.6" r="1.1" fill="${markColor}"/>`;
  const shape = name.includes("triangle") ? `<path d="M8 1 15.5 14.5H.5Z" fill="${color}"/>` : `<circle cx="8" cy="8" r="8" fill="${color}"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" style="flex:none">${shape}${mark}</svg>`;
}

function render(node, dark, parentLayout, mono) {
  const align = { start: "flex-start", center: "center", end: "flex-end" };
  if (node.type === "spacer") {
    return node.length == null ? `<div style="flex:1 1 0;min-width:${parentLayout === "horizontal" ? 8 : 0}px;min-height:0"></div>` : `<div style="flex:none;width:${parentLayout === "horizontal" ? node.length : 0}px;height:${parentLayout === "vertical" ? node.length : 0}px"></div>`;
  }
  if (node.type === "text") {
    const color = mono ? "#fff" : colorOf(node.textColor, dark) ?? (dark ? "#fff" : "#000");
    const lines = node.lineLimit ?? 0;
    const clamp = lines === 1 ? "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" : lines > 1 ? `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${lines};overflow:hidden;` : "";
    return `<div style="${fontCss(node.font)}color:${color};${clamp}text-align:${node.align};min-width:0;flex:0 1 auto;line-height:1.2">${esc(node.text)}</div>`;
  }
  if (node.type === "image") {
    const size = node.imageSize?.width ?? 16;
    return symbolSvg(node.image.symbol, size, mono ? "#fff" : colorOf(node.tintColor, dark) ?? "#888", mono ? "#1d2633" : "#fff");
  }
  const vertical = node.layout === "vertical";
  const w = node.size?.width, h = node.size?.height;
  const style = [
    "display:flex",
    `flex-direction:${vertical ? "column" : "row"}`,
    `align-items:${vertical ? (node.type === "widget" ? "flex-start" : "stretch") : align[node.align] ?? "center"}`,
    node.type === "widget" ? "justify-content:center;width:100%;height:100%;box-sizing:border-box" : "min-width:0",
    w ? `width:${w}px;flex:none` : "",
    h ? `height:${h}px` : "",
    node.backgroundColor ? `background:${colorOf(node.backgroundColor, dark)}` : "",
    node.cornerRadius ? `border-radius:${node.cornerRadius}px` : "",
    node.padding ? `padding:${node.padding.map((p) => `${p}px`).join(" ")}` : "",
    // In a vertical widget, horizontal stacks take the full width (as in SwiftUI with spacers).
    parentLayout === "vertical" && !vertical ? "align-self:stretch" : "",
  ].filter(Boolean).join(";");
  return `<div style="${style}">${node.children.map((c) => render(c, dark, node.layout, mono)).join("")}</div>`;
}

async function widgetHtml(family, dark, opts = {}) {
  const accessory = family.startsWith("accessory");
  const { state } = await runScript({
    config: { runsInWidget: !accessory, runsInAccessoryWidget: accessory, widgetFamily: family },
    keychain: opts.noSettings ? {} : SETTINGS,
    files: opts.cache ? { "/docs/limieten-widget-cache.json": JSON.stringify(fixture) } : {},
    respond: opts.fail ? async () => ({ status: opts.fail, json: { error: "x" } }) : async () => ({ status: 200, json: fixture }),
  });
  const [width, height] = SIZES[family];
  const bg = accessory ? (state.widget.addAccessoryWidgetBackground ? "rgba(255,255,255,.18)" : "transparent") : colorOf(state.widget.backgroundColor, dark);
  const radius = family === "accessoryCircular" ? "50%" : accessory ? "12px" : "22px";
  return `<figure><div class="w" style="width:${width}px;height:${height}px;background:${bg};border-radius:${radius}">${render(state.widget, dark, null, accessory)}</div><figcaption>${opts.label ?? family}</figcaption></figure>`;
}

const sections = [];
for (const dark of [false, true]) {
  const items = [];
  for (const family of ["small", "medium", "large"]) items.push(await widgetHtml(family, dark));
  sections.push(`<section class="${dark ? "dark" : "light"}"><h2>${dark ? "Donker" : "Licht"}</h2><div class="row">${items.join("")}</div></section>`);
}
const states = [
  await widgetHtml("small", false, { fail: 503, cache: true, label: "small · fout, met cache" }),
  await widgetHtml("small", false, { fail: 401, label: "small · token onjuist, geen cache" }),
  await widgetHtml("medium", true, { noSettings: true, label: "medium · nog niet ingesteld" }),
];
const lock = [await widgetHtml("accessoryRectangular", true), await widgetHtml("accessoryCircular", true)];

process.stdout.write(`<!doctype html><meta charset="utf-8"><title>Widget preview</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#d9d6cf}
section{padding:16px 20px}
section.dark,.lock{background:#1d2633}
h2{font-size:13px;margin:0 0 10px;color:#555;font-weight:600}
.dark h2,.lock h2{color:#bbb}
.row{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
figure{margin:0}
figcaption{font-size:11px;color:#666;margin-top:6px}
.dark figcaption,.lock figcaption{color:#aaa}
.w{overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.lock .w{backdrop-filter:blur(10px)}
</style>
${sections.join("")}
<section><h2>Foutstatussen</h2><div class="row">${states.join("")}</div></section>
<section class="lock"><h2>Vergrendelscherm</h2><div class="row">${lock.join("")}</div></section>
`);
