import { services } from "@config/limits.config";
import { LimitList } from "@/components/LimitList";
import { ManualForm } from "@/components/ManualForm";
import { Overview } from "@/components/Overview";
import { RefreshButton } from "@/components/RefreshButton";
import { ServiceCard } from "@/components/ServiceCard";
import { formatDateTime } from "@/lib/format";
import { byUrgency, headroom, type Headroom } from "@/lib/headroom";
import { readManual } from "@/lib/manual";
import { fetchAll } from "@/lib/runner";

// Always fetch fresh data on load / refresh.
export const dynamic = "force-dynamic";

export default async function Page() {
  const [results, manual] = await Promise.all([fetchAll(), readManual().catch(() => [])]);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const limitsByService = new Map<string, Headroom[]>();
  for (const r of results) {
    limitsByService.set(r.id, r.metrics.flatMap((m) => headroom(m, r.name, now) ?? []));
  }
  const allLimits = [...limitsByService.values()].flat().sort(byUrgency);
  const failed = results.filter((r) => r.error && r.id !== "_manual").map((r) => r.name);

  const serviceOptions = Object.entries(services)
    .filter(([, s]) => s.enabled)
    .map(([id, s]) => ({ id, name: s.name }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Usage limits</h1>
          <p className="text-sm text-muted">Updated {formatDateTime(nowIso)}</p>
        </div>
        <RefreshButton />
      </header>

      <div className="space-y-4">
        <Overview items={allLimits} now={now} failed={failed} />
        <LimitList items={allLimits} now={now} />
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Services</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {results.map((r) => (
          <ServiceCard key={r.id} result={r} limits={limitsByService.get(r.id) ?? []} now={now} />
        ))}
      </div>

      <ManualForm services={serviceOptions} entries={manual} />
    </main>
  );
}
