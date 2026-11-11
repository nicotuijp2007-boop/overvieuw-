/**
 * Reads Claude Code's local session logs: ~/.claude/projects/<project>/<session>.jsonl
 * (plus <session>/subagents/*.jsonl). Each assistant response is a JSON line with
 * message.usage. The same response is often written several times (identical usage),
 * so entries are de-duplicated on message.id + requestId.
 *
 * Only token counts, model, timestamp, session id and project folder are read.
 * Conversation text is never stored or sent.
 */
import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

/** Folders that may contain a `projects` dir. CLAUDE_CONFIG_DIR overrides the defaults. */
export function claudeDirs() {
  const custom = process.env.CLAUDE_CONFIG_DIR;
  if (custom) return custom.split(",").map((d) => d.trim()).filter(Boolean);
  return [path.join(os.homedir(), ".claude"), path.join(os.homedir(), ".config", "claude")];
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function parseFile(file, sinceMs, seen, out) {
  const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let line = 0;
  for await (const text of rl) {
    line++;
    if (!text.includes('"usage"')) continue; // cheap pre-filter
    let d;
    try {
      d = JSON.parse(text);
    } catch {
      continue; // partially written last line
    }
    const msg = d?.message;
    const u = msg?.usage;
    if (d?.type !== "assistant" || !u) continue;
    const ts = Date.parse(d.timestamp);
    if (Number.isNaN(ts) || ts < sinceMs) continue;
    const key = msg.id || d.requestId ? `${msg.id}:${d.requestId}` : `${file}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      timestamp: ts,
      sessionId: String(d.sessionId ?? path.basename(file, ".jsonl")),
      project: String(d.cwd ?? ""),
      model: String(msg.model ?? "unknown"),
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheWrite: num(u.cache_creation_input_tokens),
      cacheRead: num(u.cache_read_input_tokens),
    });
  }
}

/** De-duplicated entries newer than sinceMs, from every log file. */
export async function loadEntries(sinceMs) {
  const dirs = [];
  const seen = new Set();
  const entries = [];
  for (const base of claudeDirs()) {
    const dir = path.join(base, "projects");
    let names;
    try {
      names = await fs.readdir(dir, { recursive: true });
    } catch {
      continue;
    }
    dirs.push(dir);
    for (const n of names) {
      if (!n.endsWith(".jsonl")) continue;
      const file = path.join(dir, n);
      try {
        if ((await fs.stat(file)).mtimeMs < sinceMs) continue; // untouched since the window started
        await parseFile(file, sinceMs, seen, entries);
      } catch {
        // file deleted while reading: skip
      }
    }
  }
  return { dirs, entries };
}

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** One row per session per local day: what the dashboard stores. */
export function aggregate(entries) {
  const rows = new Map();
  for (const e of entries) {
    const day = dayKey(e.timestamp);
    const k = `${e.sessionId}|${day}`;
    let r = rows.get(k);
    if (!r) {
      r = { sessionId: e.sessionId, day, project: e.project, models: [], input: 0, output: 0, cacheWrite: 0, cacheRead: 0, responses: 0, firstAt: e.timestamp, lastAt: e.timestamp };
      rows.set(k, r);
    }
    r.input += e.input;
    r.output += e.output;
    r.cacheWrite += e.cacheWrite;
    r.cacheRead += e.cacheRead;
    r.responses++;
    r.firstAt = Math.min(r.firstAt, e.timestamp);
    r.lastAt = Math.max(r.lastAt, e.timestamp);
    if (!r.project && e.project) r.project = e.project;
    if (!r.models.includes(e.model)) r.models.push(e.model);
  }
  return [...rows.values()].map((r) => ({
    ...r,
    // Only the folder name leaves your machine, not the full path.
    project: r.project.split(/[\\/]/).filter(Boolean).pop() ?? "",
    firstAt: new Date(r.firstAt).toISOString(),
    lastAt: new Date(r.lastAt).toISOString(),
  }));
}
