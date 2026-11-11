import { services } from "@config/limits.config";
import { LimitList } from "@/components/LimitList";
import { ManualForm } from "@/components/ManualForm";
import { Overview } from "@/components/Overview";
import { RefreshButton } from "@/components/RefreshButton";
import { ServiceCard } from "@/components/ServiceCard";
import { formatDateTime, type Level } from "@/lib/format";
import { byUrgency, headroom, type Headroom } from "@/lib/headroom";
import { series } from "@/lib/history";
import { fetchDashboard } from "@/lib/runner";

// Always fetch fresh data on load / refresh.
export const dynamic = "force-dynamic";

const LEVELS: Level[] = ["ok", "warn", "danger"];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = LEVELS.find((l) => l === status);

  const { results, manual } = await fetchDashboard();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const limitsByService = new Map<string, Headroom[]>();
  for (const r of results) {
    limitsByService.set(r.id, r.metrics.flatMap((m) => headroom(m, r.name, now) ?? []));
  }
  const allLimits = [...limitsByService.values()].flat().sort(byUrgency);
  const problems = results
    .filter((r) => r.error && r.id !== "_manual")
    .map((r) => ({ name: r.name, hasValues: Boolean(r.staleSince) }));

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
          <h1 className="text-2xl font-semibold">Gebruikslimieten</h1>
          <p className="text-sm text-muted">Opgehaald {formatDateTime(nowIso)}</p>
        </div>
        <RefreshButton />
      </header>

      <div className="space-y-4">
        <Overview items={allLimits} now={now} problems={problems} filter={filter} />
        <LimitList items={allLimits} now={now} sparks={sparks} filter={filter} />
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Diensten</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {results.map((r) => (
          <ServiceCard key={r.id} result={r} limits={limitsByService.get(r.id) ?? []} now={now} />
        ))}
      </div>

      <ManualForm services={serviceOptions} entries={manual} metricNames={metricNames} />
    </main>
  );
}
