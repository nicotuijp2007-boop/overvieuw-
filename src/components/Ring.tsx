import type { Level } from "@/lib/format";
import { Tip } from "./Tip";

const STATUS_COLOR: Record<Exclude<Level, "ok">, string> = { warn: "var(--warn)", danger: "var(--danger)" };

/**
 * A ring of what's LEFT (Apple Activity style). While OK it's drawn in the service's own color;
 * Let op / Kritiek switch to the reserved status color with a soft glow, so attention goes there.
 * The optional tick marks how much TIME is left in the period: an arc shorter than the tick
 * means you run out before the reset.
 */
export function Ring({
  leftPct,
  level,
  color,
  elapsed,
  resetText,
  label,
  size = 112,
  stroke = 11,
  children,
}: {
  leftPct: number;
  level: Level;
  color: string;
  elapsed?: number;
  resetText?: string;
  label: string;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const c = size / 2;
  const r = c - stroke / 2 - 3;
  const circ = 2 * Math.PI * r;
  const frac = Math.min(Math.max(leftPct, 0), 100) / 100;
  const arc = level === "ok" ? color : STATUS_COLOR[level];
  const glow = level !== "ok";

  const timeLeft = elapsed != null ? 1 - elapsed : undefined;
  const angle = timeLeft != null ? timeLeft * 2 * Math.PI : 0;
  const at = (radius: number) => [c + radius * Math.sin(angle), c - radius * Math.cos(angle)] as const;
  const [x1, y1] = at(r - stroke / 2 - 2.5);
  const [x2, y2] = at(r + stroke / 2 + 2.5);
  const [tx, ty] = at(r);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="meter"
        aria-label={`${label}: ${leftPct}% over`}
        aria-valuenow={leftPct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={glow ? { filter: `drop-shadow(0 0 7px color-mix(in oklab, ${arc} 55%, transparent))` } : undefined}
      >
        <circle cx={c} cy={c} r={r} fill="none" stroke={arc} strokeOpacity={0.16} strokeWidth={stroke} />
        {frac > 0 && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={arc}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(circ * frac, 0.01)} ${circ}`}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
        {timeLeft != null && (
          <g strokeLinecap="round">
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--glass-solid)" strokeWidth={5} />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text)" strokeWidth={2.25} />
          </g>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
      {timeLeft != null && elapsed != null && (
        <div className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2" style={{ left: tx, top: ty }}>
          <Tip
            align={tx < size * 0.3 ? "left" : tx > size * 0.7 ? "right" : "center"}
            className="h-full w-full"
            text={`${Math.round(elapsed * 100)}% van de periode verstreken${resetText ? ` · reset ${resetText}` : ""}. Ring korter dan dit tikje = op vóór de reset.`}
          >
            <span className="block h-full w-full" />
          </Tip>
        </div>
      )}
    </div>
  );
}
