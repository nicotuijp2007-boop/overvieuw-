"use client";

import { useId, useState } from "react";

/**
 * Tooltip that works with mouse hover, keyboard focus and tap (mobile).
 * `align` keeps it on screen when the anchor is near an edge.
 */
export function Tip({
  text,
  children,
  align = "center",
  className = "",
}: {
  text: string;
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const pos = { left: "left-0", center: "left-1/2 -translate-x-1/2", right: "right-0" }[align];
  return (
    <span
      role="button"
      tabIndex={0}
      aria-describedby={id}
      onClick={() => setOpen((o) => !o)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
      className={`group/tip relative inline-flex cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full z-20 mb-2 w-max max-w-60 rounded-md bg-text px-2.5 py-1.5 text-xs font-normal leading-snug text-surface shadow-lg transition-opacity ${pos} ${
          open ? "visible opacity-100" : "invisible opacity-0 group-hover/tip:visible group-hover/tip:opacity-100 group-focus-visible/tip:visible group-focus-visible/tip:opacity-100"
        }`}
      >
        {text}
      </span>
    </span>
  );
}
