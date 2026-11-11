// Renders design/icon.svg to the app icons. Dev-only: needs Playwright's Chromium and Python's
// Pillow (for favicon.ico), which are not project dependencies. Run: node scripts/make-icons.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const svg = readFileSync("design/icon.svg", "utf8");

async function render(size, out, scale = 1) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // Maskable icons keep their content inside the central 80% "safe zone".
  const inner = Math.round(size * scale);
  await page.setContent(
    `<body style="margin:0;background:#1a1a19;display:grid;place-items:center;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body>`,
  );
  await page.screenshot({ path: out, omitBackground: false });
  await page.close();
}

const browser = await chromium.launch();
await render(180, "src/app/apple-icon.png");
await render(192, "public/icons/icon-192.png");
await render(512, "public/icons/icon-512.png");
await render(512, "public/icons/icon-maskable-512.png", 0.8);
await render(64, "/tmp/limieten-favicon-64.png");
await browser.close();
copyFileSync("design/icon.svg", "src/app/icon.svg");
execFileSync("python3", ["-c", "from PIL import Image; Image.open('/tmp/limieten-favicon-64.png').convert('RGBA').save('src/app/favicon.ico', sizes=[(16,16),(32,32),(48,48)])"]);
console.log("Icons written.");
