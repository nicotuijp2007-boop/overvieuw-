import Link from "next/link";
import { byDay, bySession, type Totals } from "@/lib/claudeData";
import { formatDateTime, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left font-medium text-muted whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap tabular-nums";
const tdNum = `${td} text-right`;

function shortModel(m: string) {
  return m.replace(/^claude-/, "");
}

function TotalsCells({ t }: { t: Totals }) {
  return (
    <>
      <td className={tdNum}>{formatNumber(t.input)}</td>
      <td className={tdNum}>{formatNumber(t.output)}</td>
      <td className={tdNum}>{formatNumber(t.cacheWrite)}</td>
      <td className={tdNum}>{formatNumber(t.cacheRead)}</td>
      <td className={`${tdNum} font-semibold`}>{formatNumber(t.total)}</td>
    </>
  );
}

const totalsHeaders = (
  <>
    <th className={`${th} text-right`}>Input</th>
    <th className={`${th} text-right`}>Output</th>
    <th className={`${th} text-right`}>Cache write</th>
    <th className={`${th} text-right`}>Cache read</th>
    <th className={`${th} text-right`}>Total</th>
  </>
);

export default async function ClaudeCodePage() {
  let days: Awaited<ReturnType<typeof byDay>> = [];
  let sessions: Awaited<ReturnType<typeof bySession>> = [];
  let error: string | null = null;
  try {
    [days, sessions] = await Promise.all([byDay(30), bySession(25)]);
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/" className="text-sm text-accent hover:underline">← Dashboard</Link>
      <h1 className="mt-2 text-2xl font-semibold">Claude Code token usage</h1>
      <p className="mt-1 text-sm text-muted">
        Sent from your computers by <code>scripts/sync-claude.mjs</code>, so it's kept even after Claude Code deletes
        old logs. Tokens are not the same as your Pro plan limits, which are measured in % on the dashboard.
      </p>
      {error && (
        <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-text" role="alert">{error}</p>
      )}

      <h2 className="mt-8 mb-2 font-semibold">Per day (last 30 days with activity)</h2>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Day</th>
              {totalsHeaders}
              <th className={`${th} text-right`}>Responses</th>
              <th className={th}>Models</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {days.map((d) => (
              <tr key={d.day}>
                <td className={td}>{d.day}</td>
                <TotalsCells t={d} />
                <td className={tdNum}>{d.responses}</td>
                <td className={`${td} text-muted`}>{d.models.map(shortModel).join(", ")}</td>
              </tr>
            ))}
            {days.length === 0 && (
              <tr><td colSpan={8} className={`${td} text-muted`}>No usage received yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 mb-2 font-semibold">Recent sessions</h2>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Last activity</th>
              <th className={th}>Computer</th>
              <th className={th}>Project</th>
              {totalsHeaders}
              <th className={th}>Models</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sessions.map((s) => (
              <tr key={`${s.machine}:${s.sessionId}`}>
                <td className={td}>{formatDateTime(s.lastAt.toISOString())}</td>
                <td className={td}>{s.machine}</td>
                <td className={td} title={`session ${s.sessionId}`}>{s.project || "?"}</td>
                <TotalsCells t={s} />
                <td className={`${td} text-muted`}>{s.models.map(shortModel).join(", ")}</td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan={9} className={`${td} text-muted`}>No sessions received yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
