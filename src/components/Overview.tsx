import Link from "next/link";
import { formatDuration, type Level } from "@/lib/format";
import type { Headroom } from "@/lib/headroom";
import { urgencyText } from "./LimitList";
import { STATUS, StatusIcon } from "./Status";

/**
 * Top of the dashboard: the most urgent limit as the one headline number, and how many
 * limits are in each state. The state tiles filter the list below.
 */
export function Overview({
  items,
  now,
  problems,
  filter,
}: {
  items: Headroom[];
  now: number;
  problems: { name: string; hasValues: boolean }[];
  filter?: Level;
}) {
  const top = items[0];
  const counts: Record<Level, number> = { ok: 0, warn: 0, danger: 0 };
  for (const h of items) counts[h.level]++;
  const urgency = top ? urgencyText(top, now) : null;

  return (
    <section className="grid gap-5 rounded-xl border border-border bg-surface p-5 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="text-sm text-secondary">Meest urgent</div>
        {top ? (
          <>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-5xl font-semibold leading-none sm:text-6xl">
                {top.leftPct}%
              </span>
              <span className="text-xl font-medium text-secondary">over</span>
              <StatusIcon level={top.level} className="h-7 w-7" />
            </div>
            <div className="mt-2 font-medium">
              {top.serviceName} · {top.metric.metric}
            </div>
            <div className="text-sm text-secondary">
              {urgency?.text ??
                (top.metric.resetsAt ? `Reset over ${formatDuration(Date.parse(top.metric.resetsAt) - now)}` : "Geen vaste reset")}
            </div>
          </>
        ) : (
          <div className="mt-1 text-5xl font-semibold leading-none text-muted">—</div>
        )}
        {problems.length > 0 && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-secondary">
            <StatusIcon level="warn" className="mt-0.5 h-3.5 w-3.5" />
            <span>
              {problems
                .map((p) => (p.hasValues ? `${p.name} kon niet verversen (laatst bekende waarden)` : `${p.name} kon niet laden`))
                .join(" · ")}
              . Zie de kaart hieronder.
            </span>
          </p>
        )}
      </div>

      <ul className="grid grid-cols-3 gap-2 md:w-[22rem]" aria-label="Filter op status">
        {(["ok", "warn", "danger"] as Level[]).map((level) => {
          const active = filter === level;
          return (
            <li key={level}>
              <Link
                href={active ? "/" : `/?status=${level}`}
                scroll={false}
                aria-pressed={active}
                title={`${STATUS[level].label}: ${STATUS[level].rule}. Klik om te filteren.`}
                className={`block rounded-lg border px-3 py-2.5 transition-colors hover:border-accent ${
                  active ? "border-accent ring-1 ring-accent" : "border-border"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-secondary">
                  <StatusIcon level={level} className="h-3.5 w-3.5" />
                  {STATUS[level].label}
                </div>
                <div className="mt-1 text-2xl font-semibold">{counts[level]}</div>
                <div className="mt-0.5 text-[11px] leading-tight text-muted">{STATUS[level].rule}</div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
