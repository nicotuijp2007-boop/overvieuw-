"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ManualEntry } from "@/lib/manual";

interface Props {
  services: { id: string; name: string }[];
  entries: ManualEntry[];
  /** Known metric names per service (from limits.config.ts), suggested in the form. */
  metricNames: Record<string, string[]>;
}

const input = "w-full rounded-xl border border-[var(--glass-line)] bg-input-bg px-2.5 py-1.5 text-sm";

export function ManualForm({ services, entries, metricNames }: Props) {
  const details = useRef<HTMLDetailsElement>(null);
  const [service, setService] = useState(services[0]?.id ?? "");

  // "Handmatig invullen" links point to #handmatig: open the section when that happens.
  useEffect(() => {
    const open = () => {
      if (location.hash === "#handmatig" && details.current) details.current.open = true;
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function send(init: RequestInit, query = "") {
    setError(null);
    const res = await fetch(`/api/manual${query}`, init);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `Opslaan mislukt (${res.status})`);
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const ok = await send({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    if (ok) form.reset();
  }

  const nameOf = (id: string) => services.find((s) => s.id === id)?.name ?? id;

  return (
    <details ref={details} id="handmatig" className="glass group mt-8 scroll-mt-4 rounded-3xl">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <span>
          <span className="font-semibold">Handmatige waarden</span>
          <span className="ml-2 text-sm text-muted">
            {entries.length ? `${entries.length} opgeslagen` : "voor cijfers zonder API, zoals Supabase-egress"}
          </span>
        </span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-[var(--glass-line)] px-5 pb-5 pt-4">
        <p className="text-sm text-muted">
          Dezelfde dienst + naam opnieuw opslaan werkt de waarde bij. Opgeslagen in je Supabase-database.
        </p>

        <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs text-muted">
            Dienst
            <select name="service" required className={input} value={service} onChange={(e) => setService(e.target.value)}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Naam
            <input name="metric" required maxLength={80} list="metric-names" placeholder="Egress" className={input} />
            <datalist id="metric-names">
              {(metricNames[service] ?? []).map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <label className="text-xs text-muted">
            Gebruikt
            <input name="used" required type="number" min="0" step="any" className={input} />
          </label>
          <label className="text-xs text-muted">
            Limiet (leeg = uit config)
            <input name="limit" type="number" min="0" step="any" className={input} />
          </label>
          <label className="text-xs text-muted">
            Eenheid
            <input name="unit" maxLength={20} placeholder="GB" className={input} />
          </label>
          <label className="text-xs text-muted">
            Reset op (optioneel)
            <input name="resetsAt" type="datetime-local" className={input} />
          </label>
          <div className="sm:col-span-3 lg:col-span-6">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm disabled:opacity-60"
            >
              Opslaan
            </button>
            {error && <span className="ml-3 text-sm text-danger-text" role="alert">{error}</span>}
          </div>
        </form>

        {entries.length > 0 && (
          <ul className="mt-5 divide-y divide-grid text-sm">
            {entries.map((e) => (
              <li key={`${e.service}:${e.metric}`} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="text-muted">{nameOf(e.service)} ·</span> {e.metric}: {e.used.toLocaleString("nl-NL")}
                  {e.limit != null && ` / ${e.limit.toLocaleString("nl-NL")}`} {e.unit}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    send({ method: "DELETE" }, `?service=${encodeURIComponent(e.service)}&metric=${encodeURIComponent(e.metric)}`)
                  }
                  className="text-xs font-medium text-muted hover:text-danger-text"
                >
                  Verwijderen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
