import { services } from "@config/limits.config";
import { LimitList } from "@/components/LimitList";
import { ManualForm } from "@/components/ManualForm";
import { Overview } from "@/components/Overview";
import { RefreshButton } from "@/components/RefreshButton";
import { ServiceCard } from "@/components/ServiceCard";
import { formatDateTime, type Level } from "@/lib/format";
import { series } from "@/lib/history";
import { limitsView } from "@/lib/present";
import { fetchDashboard } from "@/lib/runner";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { cookies } from "next/headers";

// Always fetch fresh data on load / refresh.
export const dynamic = "force-dynamic";

const LEVELS: Level[] = ["ok", "warn", "danger"];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = LEVELS.find((l) => l === status);

  const [{ results, manual }, signedInAs] = await Promise.all([
    fetchDashboard(),
    cookies().then((c) => verifySession(c.get(SESSION_COOKIE)?.value)),
  ]);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { byService: limitsByService, all: allLimits, problems } = limitsView(results, now);

  // Sparklines: history since the start of each limit's period (or the last 7 days).
  const sparks = await series(
    allLimits.map((h) => ({
      service: h.metric.service,
      metric: h.metric.metric,
      since: h.metric.periodStart ?? new Date(now - 7 * 86_400_000).toISOString(),
    })),
  ).catch(() => new Map());

  const enabled = Object.entries(services).filter(([, s]) => s.enabled);
  const serviceOptions = enabled.map(([id, s]) => ({ id, name: s.name }));
  const metricNames = Object.fromEntries(enabled.map(([id, s]) => [id, Object.keys(s.limits)]));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Gebruikslimieten</h1>
          <p className="text-sm text-muted">Opgehaald {formatDateTime(nowIso)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          {signedInAs && (
            <form method="post" action="/logout">
              <button
                type="submit"
                title={`Ingelogd als ${signedInAs}`}
                className="glass rounded-full px-4 py-1.5 text-sm font-medium text-secondary hover:border-accent"
              >
                Uitloggen
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="space-y-6">
        <Overview items={allLimits} now={now} problems={problems} filter={filter} />
        <LimitList items={allLimits} now={now} sparks={sparks} filter={filter} />
      </div>

      <h2 className="mt-10 mb-3 px-1 text-lg font-semibold">Diensten</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {results.map((r) => (
          <ServiceCard key={r.id} result={r} limits={limitsByService.get(r.id) ?? []} now={now} />
        ))}
      </div>

      <ManualForm services={serviceOptions} entries={manual} metricNames={metricNames} />
    </main>
  );
}
