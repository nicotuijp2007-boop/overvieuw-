// Minimal stand-ins for Scriptable's globals, so usage-widget.js can run under Node.
// They record what the script builds (a tree of widgets, stacks, texts, images and spacers),
// which the tests inspect and preview.mjs turns into HTML. Not a full emulation of Scriptable.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const SCRIPT_PATH = fileURLToPath(new URL("../usage-widget.js", import.meta.url));

class Node {
  constructor(type, props = {}) {
    this.type = type;
    Object.assign(this, props);
    this.children = [];
  }
}

class Container extends Node {
  addText(text) {
    const t = new Node("text", { text: String(text), align: "left" });
    t.leftAlignText = () => (t.align = "left");
    t.centerAlignText = () => (t.align = "center");
    t.rightAlignText = () => (t.align = "right");
    this.children.push(t);
    return t;
  }
  addStack() {
    const s = new Stack("stack", { layout: "horizontal", align: "center" });
    this.children.push(s);
    return s;
  }
  addSpacer(length) {
    const s = new Node("spacer", { length: length ?? null });
    this.children.push(s);
    return s;
  }
  addImage(image) {
    const i = new Node("image", { image });
    this.children.push(i);
    return i;
  }
  addDate(date) {
    return this.addText(date.toISOString());
  }
  setPadding(top, leading, bottom, trailing) {
    this.padding = [top, leading, bottom, trailing];
  }
}

class Stack extends Container {
  layoutHorizontally() { this.layout = "horizontal"; }
  layoutVertically() { this.layout = "vertical"; }
  topAlignContent() { this.align = "start"; }
  centerAlignContent() { this.align = "center"; }
  bottomAlignContent() { this.align = "end"; }
}

/** Builds a fresh set of globals. `opts` sets up config, Keychain, files, network and alerts. */
export function makeGlobals(opts = {}) {
  const state = {
    widget: null,
    presented: null,
    completed: false,
    requests: [],
    alerts: [],
    opened: [],
    keychain: new Map(Object.entries(opts.keychain ?? {})),
    files: new Map(Object.entries(opts.files ?? {})),
  };
  const answers = [...(opts.alertAnswers ?? [])];

  class ListWidget extends Container {
    constructor() {
      super("widget", { layout: "vertical" });
    }
    async presentSmall() { state.presented = "small"; }
    async presentMedium() { state.presented = "medium"; }
    async presentLarge() { state.presented = "large"; }
  }

  class Color {
    constructor(hex, alpha = 1) { this.hex = hex; this.alpha = alpha; }
    static dynamic(light, dark) { return { light, dark }; }
    static white() { return new Color("#ffffff"); }
    static black() { return new Color("#000000"); }
  }

  const Font = new Proxy({}, { get: (_, name) => (size) => ({ name: String(name), size }) });

  class Size {
    constructor(width, height) { this.width = width; this.height = height; }
  }

  const SFSymbol = {
    named(name) {
      return { name, applyFont(f) { this.font = f; }, get image() { return { symbol: name }; } };
    },
  };

  const Keychain = {
    contains: (k) => state.keychain.has(k),
    get: (k) => {
      if (!state.keychain.has(k)) throw new Error(`Keychain has no ${k}`);
      return state.keychain.get(k);
    },
    set: (k, v) => void state.keychain.set(k, v),
    remove: (k) => void state.keychain.delete(k),
  };

  const fm = {
    documentsDirectory: () => "/docs",
    cacheDirectory: () => "/cache",
    joinPath: (a, b) => `${a}/${b}`,
    fileExists: (p) => state.files.has(p),
    readString: (p) => state.files.get(p),
    writeString: (p, s) => void state.files.set(p, s),
    remove: (p) => void state.files.delete(p),
  };
  const FileManager = { local: () => fm, iCloud: () => fm };

  /** opts.respond(req) returns { status, json } or throws (network error). */
  class Request {
    constructor(url) { this.url = url; this.method = "GET"; this.headers = {}; this.response = null; }
    async loadJSON() {
      state.requests.push(this);
      if (!opts.respond) throw new Error("The Internet connection appears to be offline.");
      const { status, json } = await opts.respond(this);
      this.response = { statusCode: status };
      return json;
    }
  }

  /** Each presentAlert/presentSheet takes the next entry of opts.alertAnswers: { choice, fields }. */
  class Alert {
    constructor() { this.actions = []; this.fields = []; this.values = []; state.alerts.push(this); }
    addAction(t) { this.actions.push(t); }
    addDestructiveAction(t) { this.actions.push(t); }
    addCancelAction(t) { this.cancel = t; }
    addTextField(placeholder, text) { this.fields.push({ placeholder, text, secure: false }); }
    addSecureTextField(placeholder, text) { this.fields.push({ placeholder, text, secure: true }); }
    textFieldValue(i) { return this.values[i] ?? this.fields[i]?.text ?? ""; }
    async presentAlert() { return this.answer(); }
    async presentSheet() { return this.answer(); }
    answer() {
      const a = answers.shift() ?? { choice: -1 };
      this.values = a.fields ?? [];
      return a.choice;
    }
  }

  const Script = {
    setWidget: (w) => void (state.widget = w),
    complete: () => void (state.completed = true),
  };
  const Safari = { open: (url) => void state.opened.push(url) };

  const config = {
    runsInApp: false,
    runsInWidget: false,
    runsInAccessoryWidget: false,
    widgetFamily: null,
    ...(opts.config ?? {}),
  };

  const globals = { ListWidget, Color, Font, Size, SFSymbol, Keychain, FileManager, Request, Alert, Script, Safari, config };
  return { globals, state };
}

/**
 * Runs usage-widget.js with stubbed globals. Resolves when the script (including main(),
 * unless opts.skipMain) has finished. Returns the script's exports and the recorded state.
 */
export async function runScript(opts = {}) {
  const { globals, state } = makeGlobals(opts);
  const module = { exports: {} };
  const context = vm.createContext({
    ...globals,
    module,
    console,
    __LIMIETEN_SKIP_MAIN__: Boolean(opts.skipMain),
  });
  // Scriptable runs scripts in an async function, so top-level await works. Same here.
  const source = readFileSync(SCRIPT_PATH, "utf8");
  await vm.runInContext(`(async () => {\n${source}\n})()`, context, { filename: SCRIPT_PATH });
  return { exports: module.exports, state, globals };
}
