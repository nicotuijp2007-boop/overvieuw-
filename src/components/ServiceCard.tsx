import Link from "next/link";
import { compactNumber, formatDateTime, timeAgo, type Level } from "@/lib/format";
import type { Headroom } from "@/lib/headroom";
import type { ServiceResult } from "@/lib/runner";
import { STATUS, StatusIcon } from "./Status";

const order: Level[] = ["danger", "warn", "ok"];

/**
 * Per service: connection status, its figures that have no limit (tokens, deploys,
 * bandwidth...), and any error. Its limits are in the list above.
 */
export function ServiceCard({ result, limits, now }: { result: ServiceResult; limits: Headroom[]; now: number }) {
  const info = result.metrics.filter((m) => m.limit == null);
  const worst = order.find((l) => limits.some((h) => h.level === l));

  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface p-5">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{result.name}</h2>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            {worst ? (
              <>
                <StatusIcon level={worst} className="h-3.5 w-3.5" />
                {limits.length} limit{limits.length === 1 ? "" : "s"}, {STATUS[worst].label.toLowerCase()}
              </>
            ) : result.error ? (
              "Not loaded"
            ) : (
              "No limits"
            )}
          </div>
        </div>
        <div className="text-right text-xs text-muted">
          <span title={formatDateTime(result.fetchedAt)}>
            {result.hasConnector ? `Fetched ${timeAgo(result.fetchedAt, now)}` : "Manual only"}
          </span>
          {result.details && (
            <div>
              <Link href={result.details} className="font-medium text-accent hover:underline">
                Details →
              </Link>
            </div>
          )}
        </div>
      </header>

      {result.error && (
        <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-text" role="alert">
          {result.error}
        </p>
      )}

      {info.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {info.map((m) => (
            <div key={`${m.source}:${m.metric}`} className="min-w-0" title={m.note}>
              <dt className="truncate text-xs text-muted">{m.metric}</dt>
              <dd className="text-lg font-semibold leading-tight">
                {compactNumber(m.used)} <span className="text-sm font-normal text-secondary">{m.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {info.length > 0 && info.some((m) => m.note) && (
        <ul className="mt-3 space-y-0.5 text-xs text-muted">
          {info
            .filter((m) => m.note)
            .map((m) => (
              <li key={m.metric}>
                <span className="text-secondary">{m.metric}:</span> {m.note}
              </li>
            ))}
        </ul>
      )}
      {!result.error && info.length === 0 && limits.length === 0 && (
        <p className="mt-3 text-sm text-muted">
          {result.hasConnector ? "No figures returned." : "No connector yet. Add values under Manual values."}
        </p>
      )}
    </section>
  );
}
