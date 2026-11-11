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
    <th className={`${th} text-right`}>Cache schrijven</th>
    <th className={`${th} text-right`}>Cache lezen</th>
    <th className={`${th} text-right`}>Totaal</th>
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
      <h1 className="mt-2 text-2xl font-semibold">Claude Code-tokengebruik</h1>
      <p className="mt-1 text-sm text-muted">
        Verstuurd vanaf je computers door <code>scripts/sync-claude.mjs</code>, dus het blijft bewaard ook nadat Claude
        Code oude logs verwijdert. Tokens zijn niet hetzelfde als je Pro-limieten; die staan in % op het dashboard.
        Cache-tokens zijn hergebruikte context en tellen veel minder zwaar dan input/output.
      </p>
      {error && (
        <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-text" role="alert">{error}</p>
      )}

      <h2 className="mt-8 mb-2 font-semibold">Per dag (laatste 30 dagen met activiteit)</h2>
      <div className="glass overflow-x-auto rounded-3xl">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Dag</th>
              {totalsHeaders}
              <th className={`${th} text-right`}>Antwoorden</th>
              <th className={th}>Modellen</th>
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
              <tr><td colSpan={8} className={`${td} text-muted`}>Nog geen gebruik ontvangen.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 mb-2 font-semibold">Recente sessies</h2>
      <div className="glass overflow-x-auto rounded-3xl">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Laatste activiteit</th>
              <th className={th}>Computer</th>
              <th className={th}>Project</th>
              {totalsHeaders}
              <th className={th}>Modellen</th>
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
              <tr><td colSpan={9} className={`${td} text-muted`}>Nog geen sessies ontvangen.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
