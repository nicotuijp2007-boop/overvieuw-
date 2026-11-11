import type { Point } from "@/lib/history";

/**
 * Tiny line of "% left" over the current period (fixed 0–100% scale, so the slope is honest).
 * De-emphasised line, current value as a dot in the ink color.
 */
export function Sparkline({ points, from, now, label }: { points: Point[]; from: number; now: number; label: string }) {
  if (points.length < 2) return null;
  const W = 72;
  const H = 24;
  const pad = 3;
  const t0 = Math.min(from, points[0].t);
  const span = Math.max(now - t0, 1);
  const xy = points.map((p) => {
    const left = Math.min(Math.max(100 - p.pct, 0), 100);
    return [pad + ((p.t - t0) / span) * (W - pad * 2), pad + (1 - left / 100) * (H - pad * 2)] as const;
  });
  const last = xy[xy.length - 1];
  const firstLeft = Math.round(Math.max(100 - points[0].pct, 0));
  const lastLeft = Math.round(Math.max(100 - points[points.length - 1].pct, 0));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`${label}: van ${firstLeft}% naar ${lastLeft}% over deze periode`}
      className="shrink-0"
    >
      <title>{`Verloop deze periode: ${firstLeft}% → ${lastLeft}% over`}</title>
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} className="stroke-grid" strokeWidth="1" />
      <polyline
        points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        className="stroke-secondary"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" className="fill-text stroke-surface" strokeWidth="1.5" />
    </svg>
  );
}
