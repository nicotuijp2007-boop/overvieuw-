import type { ServiceIconName } from "@config/limits.config";

/** Simple, generic glyphs (24×24, stroke-based). Deliberately no official logos. */
const GLYPHS: Record<ServiceIconName, React.ReactNode> = {
  // a four-point sparkle
  spark: <path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5ZM18 15.5c.25 1.7.8 2.25 2.5 2.5-1.7.25-2.25.8-2.5 2.5-.25-1.7-.8-2.25-2.5-2.5 1.7-.25 2.25-.8 2.5-2.5Z" />,
  // a database cylinder
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.75" />
      <path d="M5 6v6c0 1.5 3.1 2.75 7 2.75S19 13.5 19 12V6M5 12v6c0 1.5 3.1 2.75 7 2.75S19 19.5 19 18v-6" />
    </>
  ),
  // a globe
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.2 2.3 3.3 5 3.3 8s-1.1 5.7-3.3 8c-2.2-2.3-3.3-5-3.3-8S9.8 6.3 12 4Z" />
    </>
  ),
  // three connected nodes
  flow: (
    <>
      <circle cx="6" cy="7" r="2.25" />
      <circle cx="18" cy="7" r="2.25" />
      <circle cx="12" cy="17.5" r="2.25" />
      <path d="M8.2 7h7.6M7.2 8.9l3.6 6.7M16.8 8.9l-3.6 6.7" />
    </>
  ),
  box: <rect x="5" y="5" width="14" height="14" rx="3" />,
};

/** The service's icon on a tile in its identity color. */
export function ServiceIcon({ icon, color, size = 28 }: { icon: ServiceIconName; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[30%] shadow-sm"
      style={{ width: size, height: size, background: `linear-gradient(145deg, ${color}, color-mix(in oklab, ${color} 70%, #000))` }}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.62}
        height={size * 0.62}
        fill={icon === "spark" ? "#fff" : "none"}
        stroke="#fff"
        strokeWidth={icon === "spark" ? 0 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPHS[icon]}
      </svg>
    </span>
  );
}
