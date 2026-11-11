import Link from "next/link";
import type { Level } from "@/lib/format";
import type { Headroom } from "@/lib/headroom";
import { headline as headlineFor, levelCounts, problemText } from "@/lib/present";
import { serviceLook } from "@/lib/services";
import { ServiceIcon } from "./ServiceIcon";
import { STATUS, StatusIcon } from "./Status";

/**
 * A compact status bar above the list: one sentence on what needs attention (without
 * repeating the list's rings), and the status chips that filter the list.
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
  const counts = levelCounts(items);
  const h = headlineFor(items, now);
  // When the sentence is about one limit (it needs attention), show that service's icon too.
  const top = items[0];
  const aboutTop = top && h.title === `${top.serviceName} · ${top.metric.metric}`;
  const look = top ? serviceLook(top.metric.service) : null;
  const headline = h.level ? (
    <>
      <StatusIcon level={h.level} className="mt-0.5 h-5 w-5" />
      {aboutTop && look && <ServiceIcon icon={look.icon} color={look.color} size={22} />}
      <span>
        <span className="font-semibold">{h.title}</span> <span className="text-secondary">{h.detail}</span>
      </span>
    </>
  ) : (
    <span className="text-secondary">{h.title}</span>
  );

  return (
    <section className="glass flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-3xl px-5 py-4">
      <div className="min-w-0 flex-1 basis-72">
        <p className="flex items-start gap-2">{headline}</p>
        {problems.length > 0 && (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-secondary">
            <StatusIcon level="warn" className="mt-0.5 h-3.5 w-3.5" />
            <span>{problems.map(problemText).join(" · ")}</span>
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
