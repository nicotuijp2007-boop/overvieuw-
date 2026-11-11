/**
 * Reads Claude Code's local session logs: ~/.claude/projects/<project>/<session>.jsonl
 * (plus <session>/subagents/*.jsonl). Each assistant response is a JSON line with
 * message.usage. The same response is often written several times (identical usage),
 * so entries are de-duplicated on message.id + requestId.
 *
 * Only token counts, model, timestamp, session and cwd are kept. Conversation text is
 * never stored or returned.
 */
import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

export interface Entry {
  key: string;
  timestamp: number;
  sessionId: string;
  project: string;
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface Totals {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
  responses: number;
}

/** Folders that may contain a `projects` dir. CLAUDE_CONFIG_DIR overrides the defaults. */
export function claudeDirs(): string[] {
  const custom = process.env.CLAUDE_CONFIG_DIR;
  if (custom) return custom.split(",").map((d) => d.trim()).filter(Boolean);
  return [path.join(os.homedir(), ".claude"), path.join(os.homedir(), ".config", "claude")];
}

// Parsed files, re-read only when their size or mtime changes.
const fileCache = new Map<string, { mtimeMs: number; size: number; entries: Entry[] }>();

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function parseFile(file: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let line = 0;
  for await (const text of rl) {
    line++;
    // Cheap pre-filter: skip lines without usage before paying for JSON.parse.
    if (!text.includes('"usage"')) continue;
    let d: any;
    try {
      d = JSON.parse(text);
    } catch {
      continue; // partially written last line, or a corrupt line
    }
    const msg = d?.message;
    const u = msg?.usage;
    if (d?.type !== "assistant" || !u) continue;
    const ts = Date.parse(d.timestamp);
    if (Number.isNaN(ts)) continue;
    entries.push({
      key: msg.id || d.requestId ? `${msg.id}:${d.requestId}` : `${file}:${line}`,
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
  return entries;
}

export interface LoadResult {
  entries: Entry[];
  /** The projects folders that were found and read. */
  dirs: string[];
}

/** All de-duplicated entries from every log file, oldest first. */
export async function loadEntries(): Promise<LoadResult> {
  const dirs: string[] = [];
  const files: string[] = [];
  for (const base of claudeDirs()) {
    const dir = path.join(base, "projects");
    let names: string[];
    try {
      names = await fs.readdir(dir, { recursive: true });
    } catch {
      continue;
    }
    dirs.push(dir);
    for (const n of names) if (n.endsWith(".jsonl")) files.push(path.join(dir, n));
  }

  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const file of files) {
    let stat;
    try {
      stat = await fs.stat(file);
    } catch {
      continue; // deleted between readdir and stat
    }
    let cached = fileCache.get(file);
    if (!cached || cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size) {
      cached = { mtimeMs: stat.mtimeMs, size: stat.size, entries: await parseFile(file) };
      fileCache.set(file, cached);
    }
    for (const e of cached.entries) {
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      entries.push(e);
    }
  }
  entries.sort((a, b) => a.timestamp - b.timestamp);
  return { entries, dirs };
}

export function emptyTotals(): Totals {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0, responses: 0 };
}

export function addTo(t: Totals, e: Entry) {
  t.input += e.input;
  t.output += e.output;
  t.cacheWrite += e.cacheWrite;
  t.cacheRead += e.cacheRead;
  t.total += e.input + e.output + e.cacheWrite + e.cacheRead;
  t.responses++;
}

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface DayRow extends Totals {
  day: string;
  models: string[];
}

export function byDay(entries: Entry[]): DayRow[] {
  const map = new Map<string, DayRow>();
  for (const e of entries) {
    const day = dayKey(e.timestamp);
    let row = map.get(day);
    if (!row) map.set(day, (row = { day, models: [], ...emptyTotals() }));
    addTo(row, e);
    if (!row.models.includes(e.model)) row.models.push(e.model);
  }
  return [...map.values()].sort((a, b) => b.day.localeCompare(a.day));
}

export interface SessionRow extends Totals {
  sessionId: string;
  project: string;
  first: number;
  last: number;
  models: string[];
}

export function bySession(entries: Entry[]): SessionRow[] {
  const map = new Map<string, SessionRow>();
  for (const e of entries) {
    let row = map.get(e.sessionId);
    if (!row) {
      row = { sessionId: e.sessionId, project: e.project, first: e.timestamp, last: e.timestamp, models: [], ...emptyTotals() };
      map.set(e.sessionId, row);
    }
    addTo(row, e);
    row.last = Math.max(row.last, e.timestamp);
    if (!row.project && e.project) row.project = e.project;
    if (!row.models.includes(e.model)) row.models.push(e.model);
  }
  return [...map.values()].sort((a, b) => b.last - a.last);
}
