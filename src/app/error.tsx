"use client";

/** Shown when the page itself fails to load (e.g. the server timed out during a refresh). */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <div className="rounded-xl border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold">Het dashboard kon niet laden</h1>
        <p className="mt-1 text-sm text-secondary">
          Waarschijnlijk duurde een bron te lang of was er even geen verbinding. Probeer het opnieuw.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-surface"
        >
          Opnieuw proberen
        </button>
      </div>
    </main>
  );
}
