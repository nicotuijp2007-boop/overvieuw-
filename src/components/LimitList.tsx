import Link from "next/link";
import { formatDateTime, formatDuration, freshness, type Level } from "@/lib/format";
import type { Headroom } from "@/lib/headroom";
import type { Point } from "@/lib/history";
import { isAmple, leftText, urgencyText, usedText } from "@/lib/present";
import { serviceLook } from "@/lib/services";
import { Ring } from "./Ring";
import { ServiceIcon } from "./ServiceIcon";
import { Sparkline } from "./Sparkline";
import { STATUS, StatusBadge } from "./Status";

/** One limit as a glass card with a ring of what's left. */
function RingCard({ h, now, spark }: { h: Headroom; now: number; spark?: Point[] }) {
  const m = h.metric;
  const look = serviceLook(m.service);
  const urgency = urgencyText(h, now);
  const resetIn = m.resetsAt ? `over ${formatDuration(Date.parse(m.resetsAt) - now)}` : undefined;
  const from = m.periodStart ? Date.parse(m.periodStart) : now - 7 * 86_400_000;

  return (
    <li className="glass relative flex flex-col rounded-3xl p-4 focus-within:z-30 hover:z-30 sm:p-5">
      <div className="flex items-start gap-2.5">
        <ServiceIcon icon={look.icon} color={look.color} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-muted">{look.name}</div>
          <div className="line-clamp-2 font-semibold leading-tight">{m.metric}</div>
        </div>
      </div>

      <div className="my-4 flex justify-center">
        <Ring
          leftPct={h.leftPct}
          level={h.level}
          color={look.color}
          elapsed={h.elapsed}
          resetText={resetIn}
          label={`${look.name} ${m.metric}`}
        >
          <span className="text-[1.7rem] font-semibold leading-none tracking-tight">{h.leftPct}%</span>
          <span className="mt-1 text-xs font-medium text-secondary">over</span>
        </Ring>
      </div>

      <div className="mt-auto space-y-1 text-center">
        <div className="flex justify-center text-xs">
          <StatusBadge level={h.level} />
        </div>
        {m.unit !== "%" && <div className="text-sm font-medium">{leftText(h)}</div>}
        <div className="text-xs text-secondary">{usedText(h)}</div>
        {urgency ? (
          <div className={`text-xs ${urgency.urgent ? "font-semibold text-text" : "text-secondary"}`}>{urgency.text}</div>
        ) : (
          <div className="text-xs text-secondary">
            {m.resetsAt ? <span title={formatDateTime(m.resetsAt)}>Reset {resetIn}</span> : "Geen vaste reset"}
          </div>
        )}
        {urgency && m.resetsAt && (
          <div className="text-xs text-muted" title={formatDateTime(m.resetsAt)}>
            Reset {resetIn}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-[var(--glass-line)] pt-2.5">
        <span className="min-w-0 text-[11px] leading-snug text-muted" title={`${formatDateTime(m.fetchedAt)}${m.note ? ` · ${m.note}` : ""}`}>
          {freshness(m.fetchedAt, m.source, now)}
          {m.stale && " · niet ververst"}
        </span>
        {spark && <Sparkline points={spark} from={from} now={now} label={`${look.name} ${m.metric}`} />}
      </div>
    </li>
  );
}

/** A small ring for limits with nothing to watch. */
function MiniRing({ h, now }: { h: Headroom; now: number }) {
  const m = h.metric;
  const look = serviceLook(m.service);
  return (
    <li
      className="flex min-w-0 items-center gap-3"
      title={`${usedText(h)} · ${freshness(m.fetchedAt, m.source, now)}${m.stale ? " · niet ververst" : ""}${m.note ? ` · ${m.note}` : ""}`}
    >
      <Ring leftPct={h.leftPct} level={h.level} color={look.color} label={`${look.name} ${m.metric}`} size={46} stroke={6}>
        <span className="text-[11px] font-semibold">{h.leftPct}</span>
      </Ring>
      <span className="min-w-0">
        <span className="block truncate text-xs text-muted">
          {look.name}
          {m.stale && " · niet ververst"}
        </span>
        <span className="block truncate text-sm font-medium">{m.metric}</span>
        <span className="block text-xs text-secondary">{leftText(h)}</span>
      </span>
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
  const main = filter ? shown : shown.filter((h) => !isAmple(h));
  const ample = filter ? [] : shown.filter(isAmple);
  const hasTick = main.some((h) => h.elapsed != null);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-lg font-semibold">Limieten</h2>
        {filter ? (
          <span className="text-xs text-muted">
            Alleen <span className="font-medium text-secondary">{STATUS[filter].label}</span> ·{" "}
            <Link href="/" className="font-medium text-accent hover:underline">
              toon alles
            </Link>
          </span>
        ) : (
          hasTick && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-block h-3 w-[3px] rounded-full bg-text" aria-hidden />
              tikje = tijd over tot de reset · ring korter dan het tikje = op vóór de reset
            </span>
          )
        )}
      </div>

      {main.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {main.map((h) => (
            <RingCard key={`${h.metric.service}:${h.metric.metric}`} h={h} now={now} spark={sparks.get(`${h.metric.service}|${h.metric.metric}`)} />
          ))}
        </ul>
      )}

      {ample.length > 0 && (
        <div className="glass mt-3 rounded-3xl px-5 py-4 sm:mt-4">
          <div className="mb-3 text-sm font-semibold">
            Ruim binnen marge <span className="font-normal text-muted">· geen vaste reset, meer dan de helft over</span>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ample.map((h) => (
              <MiniRing key={`${h.metric.service}:${h.metric.metric}`} h={h} now={now} />
            ))}
          </ul>
        </div>
      )}

      {shown.length === 0 && (
        <p className="glass rounded-3xl px-5 py-4 text-sm text-muted">
          {filter ? "Geen limieten met deze status." : "Nog geen limieten om te tonen."}
        </p>
      )}
    </section>
  );
}
