import { formatDuration, type Level } from "@/lib/format";
import type { Headroom } from "@/lib/headroom";
import { STATUS, StatusIcon } from "./Status";

/**
 * The top of the dashboard: one hero number (what's left on the tightest limit)
 * and how many limits are in each state.
 */
export function Overview({ items, now, failed }: { items: Headroom[]; now: number; failed: string[] }) {
  const tightest = items[0];
  const counts: Record<Level, number> = { ok: 0, warn: 0, danger: 0 };
  for (const h of items) counts[h.level]++;

  return (
    <section className="grid gap-4 rounded-xl border border-border bg-surface p-5 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="text-sm text-secondary">Left on your tightest limit</div>
        {tightest ? (
          <>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-5xl font-semibold leading-none sm:text-6xl">
                {Math.round(Math.max(100 - tightest.pct, 0))}%
              </span>
              <StatusIcon level={tightest.level} className="h-7 w-7" />
            </div>
            <div className="mt-2 text-sm text-secondary">
              <span className="font-medium text-text">
                {tightest.serviceName} · {tightest.metric.metric}
              </span>
              {tightest.metric.resetsAt && <> · resets in {formatDuration(Date.parse(tightest.metric.resetsAt) - now)}</>}
            </div>
          </>
        ) : (
          <div className="mt-1 text-5xl font-semibold leading-none text-muted">—</div>
        )}
        {failed.length > 0 && (
          <p className="mt-3 text-sm text-danger-text" role="alert">
            Couldn&apos;t load {failed.join(", ")}: {failed.length > 1 ? "their" : "its"} limits are missing here. See{" "}
            {failed.length > 1 ? "the cards" : "the card"} below.
          </p>
        )}
      </div>

      <ul className="grid grid-cols-3 gap-2 md:w-80">
        {(["ok", "warn", "danger"] as Level[]).map((level) => (
          <li key={level} className="rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs text-secondary">
              <StatusIcon level={level} className="h-3.5 w-3.5" />
              {STATUS[level].label}
            </div>
            <div className="mt-1 text-2xl font-semibold">{counts[level]}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
