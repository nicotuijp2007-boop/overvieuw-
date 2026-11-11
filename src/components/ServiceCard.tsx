import Link from "next/link";
import type { Source } from "@/connectors/types";
import { compactNumber, formatClock, formatDateTime, freshness, timeAgo, type Level } from "@/lib/format";
import type { Headroom } from "@/lib/headroom";
import type { ServiceResult } from "@/lib/runner";
import { STATUS, StatusIcon } from "./Status";

const order: Level[] = ["danger", "warn", "ok"];
const HELP_URL = "https://github.com/nicotuijp2007-boop/overvieuw-#secrets";

/** Card-level freshness: the newest non-manual value, and where it came from. */
function cardFreshness(r: ServiceResult): { at: string; source: Source } {
  if (!r.hasConnector) {
    const newest = r.metrics.reduce<string | null>((a, m) => (!a || m.fetchedAt > a ? m.fetchedAt : a), null);
    return { at: newest ?? r.fetchedAt, source: "manual" };
  }
  const fetched = r.metrics.filter((m) => m.source !== "manual");
  const at = fetched.reduce<string | null>((a, m) => (!a || m.fetchedAt > a ? m.fetchedAt : a), null) ?? r.fetchedAt;
  return { at, source: fetched.some((m) => m.source === "local") ? "local" : "api" };
}

/**
 * Per service: one status line, its figures without a limit (tokens, deploys...), and a light
 * warning when the source failed. The service's limits are in the list above.
 */
export function ServiceCard({ result, limits, now }: { result: ServiceResult; limits: Headroom[]; now: number }) {
  const info = result.metrics.filter((m) => m.limit == null);
  const worst = order.find((l) => limits.some((h) => h.level === l));
  const fresh = cardFreshness(result);
  const n = limits.length;
  const limitsText = `${n} ${n === 1 ? "limiet" : "limieten"}`;

  let status: React.ReactNode;
  if (result.error) {
    status = (
      <>
        <StatusIcon level="warn" className="h-3.5 w-3.5" />
        {result.staleSince
          ? `Niet ververst · ${limitsText}, laatst bekend`
          : n > 0
            ? `Niet geladen · ${limitsText} handmatig`
            : "Niet geladen"}
      </>
    );
  } else if (worst) {
    status = (
      <>
        <StatusIcon level={worst} className="h-3.5 w-3.5" />
        {limitsText} · {STATUS[worst].label.toLowerCase()}
      </>
    );
  } else {
    status = "Geen limieten";
  }

  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{result.name}</h2>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-secondary">{status}</div>
        </div>
        {result.details && (
          <Link href={result.details} className="shrink-0 text-xs font-medium text-accent hover:underline">
            Details →
          </Link>
        )}
      </header>

      {result.error && (
        <div className="mt-3 rounded-lg border border-border px-3 py-2 text-xs">
          <p className="text-secondary">
            {result.staleSince
              ? `Kon niet verversen, waarden van ${formatClock(result.staleSince, now)}.`
              : "Kon niet laden, nog geen eerdere waarden."}
          </p>
          <details className="mt-1 text-muted">
            <summary className="cursor-pointer font-medium text-accent">Waarom?</summary>
            <p className="mt-1 break-words">{result.error}</p>
          </details>
          <p className="mt-1 flex flex-wrap gap-x-3">
            <a href="#handmatig" className="font-medium text-accent hover:underline">
              Handmatig invullen
            </a>
            <a href={HELP_URL} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
              Uitleg tokens
            </a>
          </p>
        </div>
      )}

      {info.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {info.map((m) => (
            <div key={`${m.source}:${m.metric}`} className="min-w-0">
              <dt className="text-xs text-muted">{m.metric}</dt>
              <dd className="text-lg font-semibold leading-tight">
                {compactNumber(m.used)} <span className="text-sm font-normal text-secondary">{m.unit}</span>
              </dd>
              {m.note && <dd className="text-xs text-muted">{m.note}</dd>}
            </div>
          ))}
        </dl>
      )}
      {!result.error && info.length === 0 && n === 0 && (
        <p className="mt-3 text-sm text-muted">
          {result.hasConnector ? "Geen cijfers ontvangen." : "Nog geen koppeling. Vul waarden in onder Handmatige waarden."}
        </p>
      )}

      <p className="mt-auto pt-4 text-xs text-muted" title={formatDateTime(fresh.at)}>
        {result.error && !result.staleSince
          ? `Laatste poging ${timeAgo(result.fetchedAt, now)} · mislukt`
          : freshness(fresh.at, fresh.source, now)}
      </p>
    </section>
  );
}
