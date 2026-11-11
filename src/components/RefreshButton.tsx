"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type State = "idle" | "done" | "error" | "slow";

/** Re-fetches every source. Shows progress, a short confirmation, or why it failed. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<State>("idle");
  // Counts clicks, so "done" also shows when the refresh finishes too fast to see "busy".
  const [requested, setRequested] = useState(0);

  useEffect(() => {
    if (!requested) return;
    if (pending) {
      const slow = setTimeout(() => setState("slow"), 15_000);
      return () => clearTimeout(slow);
    }
    setState("done");
    const t = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(t);
  }, [pending, requested]);

  function refresh() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState("error");
      return;
    }
    setState("idle");
    setRequested((r) => r + 1);
    startTransition(() => router.refresh());
  }

  const message =
    state === "error" ? "Geen verbinding" : state === "slow" ? "Duurt lang…" : state === "done" ? "Bijgewerkt" : null;

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span role="status" className={`text-sm ${state === "error" ? "text-danger-text" : "text-secondary"}`}>
          {message}
        </span>
      )}
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        aria-busy={pending}
        className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium hover:border-accent disabled:cursor-wait disabled:opacity-70"
      >
        <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden>
          <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {pending ? "Bezig…" : "Vernieuwen"}
      </button>
    </div>
  );
}
