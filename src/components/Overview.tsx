import Link from "next/link";
import type { Level } from "@/lib/format";
import type { Headroom } from "@/lib/headroom";
import { leftText, urgencyText } from "@/lib/present";
import { serviceLook } from "@/lib/services";
import { ServiceIcon } from "./ServiceIcon";
import { STATUS, StatusIcon } from "./Status";

/**
 * A compact status bar above the list: one sentence on what needs attention (without
 * repeating the list's bars), and the status chips that filter the list.
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
  const counts: Record<Level, number> = { ok: 0, warn: 0, danger: 0 };
  for (const h of items) counts[h.level]++;
  const top = items[0];
  const urgency = top ? urgencyText(top, now) : null;
  const attention = top && (top.level !== "ok" || urgency?.urgent);

  let headline: React.ReactNode;
  if (!top) headline = <span className="text-secondary">Nog geen limieten.</span>;
  else if (attention) {
    headline = (
      <>
        <StatusIcon level={top.level} className="mt-0.5 h-5 w-5" />
        <ServiceIcon icon={serviceLook(top.metric.service).icon} color={serviceLook(top.metric.service).color} size={22} />
        <span>
          <span className="font-semibold">
            {top.serviceName} · {top.metric.metric}
          </span>{" "}
          <span className="text-secondary">
            {leftText(top)}
            {urgency ? ` · ${urgency.text.charAt(0).toLowerCase()}${urgency.text.slice(1)}` : ""}
          </span>
        </span>
      </>
    );
  } else {
    headline = (
      <>
        <StatusIcon level="ok" className="mt-0.5 h-5 w-5" />
        <span>
          <span className="font-semibold">Alles binnen marge</span>{" "}
          <span className="text-secondary">
            · krapst: {top.serviceName} {top.metric.metric}, {leftText(top)}
          </span>
        </span>
      </>
    );
  }

  return (
    <section className="glass flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-3xl px-5 py-4">
      <div className="min-w-0 flex-1 basis-72">
        <p className="flex items-start gap-2">{headline}</p>
        {problems.length > 0 && (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-secondary">
            <StatusIcon level="warn" className="mt-0.5 h-3.5 w-3.5" />
            <span>
              {problems
                .map((p) => (p.hasValues ? `${p.name} kon niet verversen (laatst bekende waarden)` : `${p.name} kon niet laden`))
                .join(" · ")}
            </span>
          </p>
        )}
      </div>

      <div>
        <ul className="flex gap-2" aria-label="Filter op status">
          {(["ok", "warn", "danger"] as Level[]).map((level) => {
            const active = filter === level;
            return (
              <li key={level}>
                <Link
                  href={active ? "/" : `/?status=${level}`}
                  scroll={false}
                  aria-pressed={active}
                  title={`${STATUS[level].label}: ${STATUS[level].rule}. Klik om te filteren.`}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors hover:border-accent ${
                    active ? "border-accent bg-[var(--glass)] ring-1 ring-accent" : "border-[var(--glass-line)] bg-[var(--glass)]"
                  }`}
                >
                  <StatusIcon level={level} className="h-3.5 w-3.5" />
                  <span className="text-secondary">{STATUS[level].label}</span>
                  <span className="font-semibold">{counts[level]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 text-[11px] text-muted">OK &gt; 30% · Let op 10–30% · Kritiek &lt; 10% over</p>
      </div>
    </section>
  );
}
