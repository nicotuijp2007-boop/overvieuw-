import type { Source } from "@/connectors/types";

export type Level = "ok" | "warn" | "danger";

/** By % used: OK under 70% (more than 30% left), Let op 70–90%, Kritiek above 90% (less than 10% left). */
export function levelFor(pct: number): Level {
  if (pct > 90) return "danger";
  if (pct >= 70) return "warn";
  return "ok";
}

const LOCALE = "nl-NL";

export function formatNumber(n: number): string {
  return n.toLocaleString(LOCALE, { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 });
}

/** 1.284 / 12,9K / 28,9M: short numbers for stat tiles. */
export function compactNumber(n: number): string {
  if (Math.abs(n) < 10_000) return formatNumber(n);
  const units: [number, string][] = [[1e9, "mld"], [1e6, "M"], [1e3, "K"]];
  for (const [size, suffix] of units) {
    if (Math.abs(n) >= size) return `${(n / size).toLocaleString(LOCALE, { maximumFractionDigits: 1 })}${suffix}`;
  }
  return formatNumber(n);
}

/** "3d 4u", "2u 15m", "5m". Zero or negative durations return "nu". */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "nu";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d > 0) return h ? `${d}d ${h}u` : `${d}d`;
  if (h > 0) return min ? `${h}u ${min}m` : `${h}u`;
  return `${Math.max(min, 1)}m`;
}

/** Relative time: "net", "3m geleden", "2u 15m geleden". The one helper for every "updated" text. */
export function timeAgo(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (ms < 60_000) return "net";
  return `${formatDuration(ms)} geleden`;
}

/**
 * Times are shown in DASHBOARD_TIMEZONE (e.g. "Europe/Amsterdam"). On Netlify the server runs
 * in UTC, so set it there; locally it defaults to your computer's timezone.
 */
function timeZone(): string | undefined {
  return process.env.DASHBOARD_TIMEZONE || undefined;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone: timeZone() });
}

/** "14:02" for today, otherwise "10 nov 14:02". */
export function formatClock(iso: string, now = Date.now()): string {
  const tz = timeZone();
  const day = (t: number | string) => new Date(t).toLocaleDateString(LOCALE, { timeZone: tz });
  const time = new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: tz });
  if (day(iso) === day(now)) return time;
  return `${new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: tz })} ${time}`;
}

/** Today's date as YYYY-MM-DD in DASHBOARD_TIMEZONE. */
export function todayIn(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const SOURCE_LABEL: Record<Source, string> = { api: "live", local: "gesynchroniseerd", manual: "handmatig" };

/** The one format for freshness: "Bijgewerkt 3m geleden · live". */
export function freshness(iso: string, source: Source, now = Date.now()): string {
  return `Bijgewerkt ${timeAgo(iso, now)} · ${SOURCE_LABEL[source]}`;
}
