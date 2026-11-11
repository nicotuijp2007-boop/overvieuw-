import type { Source } from "@/connectors/types";
import { formatDateTime, formatDuration, formatNumber, timeAgo } from "@/lib/format";
import type { Headroom } from "@/lib/headroom";
import { Meter, StatusBadge } from "./Status";

const sourceLabel: Record<Source, string> = { api: "API", local: "Synced", manual: "Manual" };

/** "27% left" for percentage limits; "165 credits left" otherwise. */
function leftText(h: Headroom): string {
  if (h.metric.unit === "%") return `${Math.round(Math.max(100 - h.pct, 0))}% left`;
  return `${formatNumber(h.remaining)} ${h.metric.unit} left`;
}

function usedText(h: Headroom): string {
  const m = h.metric;
  if (m.unit === "%") return `${formatNumber(m.used)}% used`;
  return `${formatNumber(m.used)} of ${formatNumber(m.limit ?? 0)} ${m.unit} used · ${Math.round(h.pct)}%`;
}

function paceText(h: Headroom, now: number): string | null {
  if (h.runsOutAt) return `At this pace you run out in ${formatDuration(Date.parse(h.runsOutAt) - now)}, before the reset`;
  if (h.projectedPct != null) return `On pace for about ${Math.round(Math.min(h.projectedPct, 999))}% by the reset`;
  return null;
}

function LimitRow({ h, now }: { h: Headroom; now: number }) {
  const m = h.metric;
  const pace = paceText(h, now);
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">{h.serviceName}</span>
          <div className="font-medium">{m.metric}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{leftText(h)}</div>
        </div>
      </div>

      <div className="mt-2">
        <Meter pct={h.pct} level={h.level} elapsed={h.elapsed} label={`${h.serviceName} ${m.metric}`} />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <StatusBadge level={h.level} />
        <span className="tabular-nums text-secondary">{usedText(h)}</span>
        {m.resetsAt && <span title={formatDateTime(m.resetsAt)}>Resets in {formatDuration(Date.parse(m.resetsAt) - now)}</span>}
        <span title={formatDateTime(m.fetchedAt)}>
          {sourceLabel[m.source]}
          {m.source !== "api" && ` ${timeAgo(m.fetchedAt, now)}`}
        </span>
      </div>
      {(pace || m.note) && (
        <div className="mt-1 text-xs text-muted">
          {pace && <span className={h.runsOutAt ? "font-medium text-secondary" : ""}>{pace}</span>}
          {pace && m.note && " · "}
          {m.note}
        </div>
      )}
    </li>
  );
}

export function LimitList({ items, now }: { items: Headroom[]; now: number }) {
  const hasPeriod = items.some((h) => h.elapsed != null);
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">All limits, fullest first</h2>
        {hasPeriod && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="inline-block h-3 w-0.5 rounded-full bg-text" aria-hidden />
            how far into the period you are
          </span>
        )}
      </div>
      {items.length ? (
        <ul className="divide-y divide-grid">
          {items.map((h) => (
            <LimitRow key={`${h.metric.service}:${h.metric.metric}`} h={h} now={now} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No limits to show yet.</p>
      )}
    </section>
  );
}
