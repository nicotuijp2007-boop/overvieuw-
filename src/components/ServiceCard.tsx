import type { Source, UsageMetric } from "@/connectors/types";
import { formatDateTime, formatDuration, formatNumber, levelFor, timeAgo, type Level } from "@/lib/format";
import type { ServiceResult } from "@/lib/runner";

const barColor: Record<Level, string> = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" };
const textColor: Record<Level, string> = { ok: "text-ok", warn: "text-warn", danger: "text-danger" };

const badgeStyle: Record<Source, string> = {
  api: "border-border text-muted",
  local: "border-border text-muted",
  manual: "border-accent text-accent",
};

function Badge({ source }: { source: Source }) {
  return (
    <span className={`rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${badgeStyle[source]}`}>
      {source}
    </span>
  );
}

function MetricRow({ m, now }: { m: UsageMetric; now: string }) {
  const nowMs = new Date(now).getTime();
  const pct = m.limit ? (m.used / m.limit) * 100 : null;
  const level = pct != null ? levelFor(pct) : null;

  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          {m.metric} <Badge source={m.source} />
        </span>
        {pct != null && level && (
          <span className={`text-sm font-semibold tabular-nums ${textColor[level]}`}>{Math.round(pct)}%</span>
        )}
      </div>

      <div className="mt-0.5 text-xs text-muted tabular-nums">
        {formatNumber(m.used)}
        {m.limit != null && ` / ${formatNumber(m.limit)}`} {m.unit}
      </div>

      {pct != null && level && (
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-track"
          role="progressbar"
          aria-label={m.metric}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={`h-full rounded-full ${barColor[level]}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}

      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
        {m.resetsAt && (
          <span title={formatDateTime(m.resetsAt)}>
            Resets in {formatDuration(new Date(m.resetsAt).getTime() - nowMs)}
          </span>
        )}
        {m.source === "manual" && <span title={formatDateTime(m.fetchedAt)}>Entered {timeAgo(m.fetchedAt, nowMs)}</span>}
        {m.note && <span>{m.note}</span>}
      </div>
    </li>
  );
}

export function ServiceCard({ result, now }: { result: ServiceResult; now: string }) {
  return (
    <section className="flex flex-col rounded-lg border border-border bg-surface p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{result.name}</h2>
        <span className="text-xs text-muted" title={formatDateTime(result.fetchedAt)}>
          {result.hasConnector ? `Fetched ${timeAgo(result.fetchedAt, new Date(now).getTime())}` : "Manual only"}
        </span>
      </header>

      {result.error && (
        <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {result.error}
        </p>
      )}

      {result.metrics.length > 0 ? (
        <ul className="mt-1 divide-y divide-border">
          {result.metrics.map((m) => (
            <MetricRow key={`${m.source}:${m.metric}`} m={m} now={now} />
          ))}
        </ul>
      ) : (
        !result.error && (
          <p className="mt-3 text-sm text-muted">
            {result.hasConnector
              ? "No metrics returned."
              : "No connector yet. Add values with the manual entry form below."}
          </p>
        )
      )}
    </section>
  );
}
