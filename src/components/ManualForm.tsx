"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ManualEntry } from "@/lib/manual";

interface Props {
  services: { id: string; name: string }[];
  entries: ManualEntry[];
}

const input = "w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm";

export function ManualForm({ services, entries }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function send(init: RequestInit, query = "") {
    setError(null);
    const res = await fetch(`/api/manual${query}`, init);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
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
    <section className="mt-10 rounded-lg border border-border bg-surface p-4">
      <h2 className="font-semibold">Manual entry</h2>
      <p className="mt-1 text-sm text-muted">
        For values no API provides (e.g. Claude Pro session/weekly %). Entering the same service + metric again
        updates it. Stored in your Supabase database.
      </p>

      <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-xs text-muted">
          Service
          <select name="service" required className={input}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Metric
          <input name="metric" required maxLength={80} placeholder="Session (5-hour)" className={input} />
        </label>
        <label className="text-xs text-muted">
          Used
          <input name="used" required type="number" min="0" step="any" className={input} />
        </label>
        <label className="text-xs text-muted">
          Limit (blank = from config)
          <input name="limit" type="number" min="0" step="any" className={input} />
        </label>
        <label className="text-xs text-muted">
          Unit
          <input name="unit" maxLength={20} placeholder="%" className={input} />
        </label>
        <label className="text-xs text-muted">
          Resets at (optional)
          <input name="resetsAt" type="datetime-local" className={input} />
        </label>
        <div className="sm:col-span-3 lg:col-span-6">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-60"
          >
            Save
          </button>
          {error && <span className="ml-3 text-sm text-danger" role="alert">{error}</span>}
        </div>
      </form>

      {entries.length > 0 && (
        <ul className="mt-5 divide-y divide-border text-sm">
          {entries.map((e) => (
            <li key={`${e.service}:${e.metric}`} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="text-muted">{nameOf(e.service)} ·</span> {e.metric}: {e.used}
                {e.limit != null && ` / ${e.limit}`} {e.unit}
              </span>
              <button
                type="button"
                onClick={() =>
                  send({ method: "DELETE" }, `?service=${encodeURIComponent(e.service)}&metric=${encodeURIComponent(e.metric)}`)
                }
                className="text-xs text-muted hover:text-danger"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
