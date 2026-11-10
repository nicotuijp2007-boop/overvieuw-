import { services } from "@config/limits.config";
import { ManualForm } from "@/components/ManualForm";
import { RefreshButton } from "@/components/RefreshButton";
import { ServiceCard } from "@/components/ServiceCard";
import { formatDateTime } from "@/lib/format";
import { readManual } from "@/lib/manual";
import { fetchAll } from "@/lib/runner";

// Always fetch fresh data on load / refresh.
export const dynamic = "force-dynamic";

export default async function Page() {
  const [results, manual] = await Promise.all([fetchAll(), readManual().catch(() => [])]);
  const now = new Date().toISOString();
  const serviceOptions = Object.entries(services)
    .filter(([, s]) => s.enabled)
    .map(([id, s]) => ({ id, name: s.name }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Usage limits</h1>
          <p className="text-sm text-muted">Last updated {formatDateTime(now)}</p>
        </div>
        <RefreshButton />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((r) => (
          <ServiceCard key={r.id} result={r} now={now} />
        ))}
      </div>

      <ManualForm services={serviceOptions} entries={manual} />
    </main>
  );
}
