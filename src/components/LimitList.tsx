import Link from "next/link";
import { formatDateTime, formatDuration, formatNumber, freshness, type Level } from "@/lib/format";
import type { Headroom } from "@/lib/headroom";
import type { Point } from "@/lib/history";
import { Sparkline } from "./Sparkline";
import { Meter, STATUS, StatusBadge, StatusIcon } from "./Status";

/** "28% over" for percentage limits; "165 credits over" otherwise. */
export function leftText(h: Headroom): string {
  if (h.metric.unit === "%") return `${h.leftPct}% over`;
  return `${formatNumber(h.remaining)} ${h.metric.unit} over`;
}

/** The urgency line: when it runs out, or what's expected at the reset. */
export function urgencyText(h: Headroom, now: number): { text: string; urgent: boolean } | null {
  if (h.metric.used >= (h.metric.limit ?? Infinity)) return { text: "Limiet bereikt", urgent: true };
  if (h.runsOutAt) return { text: `Op over ~${formatDuration(Date.parse(h.runsOutAt) - now)}, vóór de reset`, urgent: true };
  if (h.projectedPct != null) {
    return { text: `Bij dit tempo ~${Math.max(100 - Math.round(h.projectedPct), 0)}% over bij de reset`, urgent: false };
  }
  return null;
}

function usedText(h: Headroom): string {
  const m = h.metric;
  if (m.unit === "%") return `${h.usedPct}% gebruikt`;
  return `${formatNumber(m.used)} van ${formatNumber(m.limit ?? 0)} ${m.unit} gebruikt`;
}

function LimitRow({ h, now, spark, showLegend }: { h: Headroom; now: number; spark?: Point[]; showLegend: boolean }) {
  const m = h.metric;
  const urgency = urgencyText(h, now);
  const resetIn = m.resetsAt ? `over ${formatDuration(Date.parse(m.resetsAt) - now)}` : undefined;
  const from = m.periodStart ? Date.parse(m.periodStart) : now - 7 * 86_400_000;
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{h.serviceName}</div>
          <div className="font-medium">{m.metric}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {spark && <Sparkline points={spark} from={from} now={now} label={`${h.serviceName} ${m.metric}`} />}
          <div className="text-right">
            <div className="text-lg font-semibold leading-tight">{leftText(h)}</div>
            {m.unit !== "%" && <div className="text-xs text-secondary">{h.leftPct}%</div>}
          </div>
        </div>
      </div>

      <div className="mt-2">
        <Meter leftPct={h.leftPct} level={h.level} elapsed={h.elapsed} resetText={resetIn} label={`${h.serviceName} ${m.metric}`} />
      </div>
      {showLegend && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
          <span className="mt-0.5 inline-block h-3 w-0.5 shrink-0 rounded-full bg-text" aria-hidden />
          <span>Het streepje toont hoeveel tijd er nog over is tot de reset. Is de balk korter, dan raak je op vóór de reset.</span>
        </p>
      )}

      {urgency && (
        <p className={`mt-1.5 text-sm ${urgency.urgent ? "font-medium text-text" : "text-secondary"}`}>{urgency.text}</p>
      )}

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <StatusBadge level={h.level} />
          <span className="text-secondary">{usedText(h)}</span>
        </span>
        <span className="whitespace-nowrap">
          {m.resetsAt ? <span title={formatDateTime(m.resetsAt)}>Reset {resetIn}</span> : "Geen vaste reset"}
        </span>
        <span className="whitespace-nowrap" title={formatDateTime(m.fetchedAt)}>
          {freshness(m.fetchedAt, m.source, now)}
          {m.stale && " · niet ververst"}
        </span>
      </div>
      {m.note && <p className="mt-0.5 text-xs text-muted">{m.note}</p>}
    </li>
  );
}

export function LimitList({
  items,
  now,
  sparks,
  filter,
}: {
  items: Headroom[];
  now: number;
  sparks: Map<string, Point[]>;
  filter?: Level;
}) {
  const shown = filter ? items.filter((h) => h.level === filter) : items;
  // Limits without a reset that are well within margin fold into one line (not while filtering).
  const isAmple = (h: Headroom) => !filter && !h.metric.resetsAt && h.level === "ok" && !h.runsOutAt && h.leftPct >= 50;
  const main = shown.filter((h) => !isAmple(h));
  const ample = shown.filter(isAmple);
  const legendAt = main.findIndex((h) => h.elapsed != null);
  const row = (h: Headroom, i: number) => (
    <LimitRow
      key={`${h.metric.service}:${h.metric.metric}`}
      h={h}
      now={now}
      spark={sparks.get(`${h.metric.service}|${h.metric.metric}`)}
      showLegend={i === legendAt}
    />
  );
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Alle limieten, meest urgent eerst</h2>
        {filter && (
          <span className="text-xs text-muted">
            Alleen <span className="font-medium text-secondary">{STATUS[filter].label}</span> ·{" "}
            <Link href="/" className="font-medium text-accent hover:underline">
              toon alles
            </Link>
          </span>
        )}
      </div>
      {shown.length ? (
        <ul className="divide-y divide-grid">
          {main.map(row)}
          {ample.length > 0 && (
            <li className={main.length ? "pt-4" : ""}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusIcon level="ok" className="h-4 w-4" />
                    <span className="font-medium">
                      {ample.length} {ample.length === 1 ? "limiet" : "limieten"} ruim binnen marge
                    </span>
                    <span className="truncate text-sm text-muted">
                      {ample.map((h) => h.metric.metric).join(", ")}
                    </span>
                  </span>
                  <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
                </summary>
                <ul className="mt-2 divide-y divide-grid border-t border-grid pt-4">{ample.map((h) => row(h, -1))}</ul>
              </details>
            </li>
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted">{filter ? "Geen limieten met deze status." : "Nog geen limieten om te tonen."}</p>
      )}
    </section>
  );
}
