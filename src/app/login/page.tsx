import { safeNext } from "@/lib/session";

export const metadata = { title: "Inloggen · Gebruikslimieten" };

const MESSAGES: Record<string, string> = {
  invalid: "E-mail of wachtwoord klopt niet.",
  unavailable: "Supabase is even niet bereikbaar. Probeer het zo opnieuw.",
  config: "Inloggen is nog niet ingesteld op de server (zie README: Inloggen).",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const message = error ? (MESSAGES[error] ?? MESSAGES.invalid) : null;
  const input =
    "mt-1 w-full rounded-xl border border-[var(--glass-line)] bg-input-bg px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <form method="post" action="/api/auth/login" className="glass w-full max-w-sm rounded-3xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Gebruikslimieten</h1>
        <p className="mt-1 text-sm text-secondary">Log in met je Supabase-account. Je blijft 30 dagen ingelogd.</p>

        {message && (
          <p role="alert" className="mt-4 rounded-xl border border-[var(--glass-line)] bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {message}
          </p>
        )}

        <input type="hidden" name="next" value={safeNext(next)} />
        <label className="mt-5 block text-sm font-medium">
          E-mail
          <input name="email" type="email" required autoComplete="username" inputMode="email" autoCapitalize="none" className={input} />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Wachtwoord
          <input name="password" type="password" required autoComplete="current-password" className={input} />
        </label>
        <button type="submit" className="mt-5 w-full rounded-full bg-accent px-4 py-2.5 font-medium text-white shadow-sm hover:opacity-95">
          Inloggen
        </button>
        <p className="mt-4 text-xs text-muted">
          Wachtwoord vergeten? Stel een nieuw in via Supabase → Authentication → Users.
        </p>
      </form>
    </main>
  );
}
