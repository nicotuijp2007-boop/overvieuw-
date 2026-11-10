import { promises as fs } from "node:fs";
import path from "node:path";
import type { UsageMetric } from "@/connectors/types";

/** Manual values live in data/manual.json (gitignored). Editable by hand or via the form. */
const FILE = path.join(process.cwd(), "data", "manual.json");

export interface ManualEntry {
  service: string;
  metric: string;
  used: number;
  limit: number | null;
  unit: string;
  resetsAt?: string;
  updatedAt: string;
}

export async function readManual(): Promise<ManualEntry[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error(`data/manual.json could not be read: ${(err as Error).message}`);
  }
}

async function write(entries: ManualEntry[]) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(entries, null, 2) + "\n");
  await fs.rename(tmp, FILE);
}

/** Insert or replace the entry with the same service + metric. */
export async function upsertManual(entry: ManualEntry) {
  const entries = (await readManual()).filter(
    (e) => !(e.service === entry.service && e.metric === entry.metric),
  );
  entries.push(entry);
  await write(entries);
}

export async function deleteManual(service: string, metric: string) {
  await write((await readManual()).filter((e) => !(e.service === service && e.metric === metric)));
}

export function manualToMetric(e: ManualEntry): UsageMetric {
  return {
    service: e.service,
    metric: e.metric,
    used: e.used,
    limit: e.limit,
    unit: e.unit,
    resetsAt: e.resetsAt,
    source: "manual",
    fetchedAt: e.updatedAt,
  };
}
