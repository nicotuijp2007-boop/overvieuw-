import { safeNext } from "@/lib/session";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  wachtwoord: "Onjuist wachtwoord.",
  geheim: "Inloggen met een cookie is nog niet ingesteld: SESSION_SECRET ontbreekt op de server.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ fout?: string; next?: string; uit?: string }> }) {
  const { fout, next, uit } = await searchParams;
  const error = fout ? (ERRORS[fout] ?? "Inloggen mislukt.") : null;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold">Limieten</h1>
      <p className="mt-1 text-sm text-muted">Log in om je gebruikslimieten te zien.</p>
      <form action="/api/login" method="post" className="mt-6 space-y-3 rounded-xl border border-border bg-surface p-5">
        <input type="hidden" name="next" value={safeNext(next)} />
        <label className="block text-sm font-medium" htmlFor="password">
          Wachtwoord
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="w-full rounded-lg border border-border bg-input-bg px-3 py-2"
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {error}
          </p>
        )}
        {uit && !error && <p className="text-sm text-secondary">Je bent uitgelogd op dit apparaat.</p>}
        <button type="submit" className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-white hover:opacity-90">
          Inloggen
        </button>
        <p className="text-xs text-muted">Je blijft 30 dagen ingelogd op dit apparaat.</p>
      </form>
    </main>
  );
}
