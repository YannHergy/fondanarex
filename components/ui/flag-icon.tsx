import type { CSSProperties, ReactElement } from "react";

import { isCurrencyCode } from "@/lib/utils";

/**
 * Hand-drawn flag SVGs, one per currency.
 *
 * Real vector shapes rather than emoji — emoji flags are exactly what the
 * rewrite removed (see currency-badge.tsx) because they render inconsistently
 * across platforms and carry no accessible label. These are `aria-hidden`
 * decorations next to the currency code, which is already the accessible text.
 */

function UsdFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-full w-full">
      <rect width="24" height="16" fill="#B22234" />
      {[1, 3, 5, 7, 9, 11].map((y) => (
        <rect key={y} y={y} width="24" height="1.23" fill="white" />
      ))}
      <rect width="10" height="8.6" fill="#3C3B6E" />
    </svg>
  );
}

function EurFlag() {
  const stars = Array.from({ length: 12 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 12 - Math.PI / 2;
    return { x: 12 + 6 * Math.cos(angle), y: 8 + 6 * Math.sin(angle) };
  });
  return (
    <svg viewBox="0 0 24 16" className="h-full w-full">
      <rect width="24" height="16" fill="#003399" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r="0.8" fill="#FFCC00" />
      ))}
    </svg>
  );
}

function GbpFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-full w-full">
      <rect width="24" height="16" fill="#012169" />
      <path d="M0 0 L24 16 M24 0 L0 16" stroke="white" strokeWidth="3.2" />
      <path d="M0 0 L24 16 M24 0 L0 16" stroke="#C8102E" strokeWidth="1.1" />
      <path d="M12 0 V16 M0 8 H24" stroke="white" strokeWidth="5.4" />
      <path d="M12 0 V16 M0 8 H24" stroke="#C8102E" strokeWidth="3.2" />
    </svg>
  );
}

function JpyFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-full w-full">
      <rect width="24" height="16" fill="white" />
      <circle cx="12" cy="8" r="4.6" fill="#BC002D" />
    </svg>
  );
}

function AudFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-full w-full">
      <rect width="24" height="16" fill="#00247D" />
      <g transform="scale(0.5)" clipPath="inset(0)">
        <rect width="24" height="16" fill="#00247D" />
        <path d="M0 0 L24 16 M24 0 L0 16" stroke="white" strokeWidth="3.2" />
        <path d="M12 0 V16 M0 8 H24" stroke="white" strokeWidth="5.4" />
        <path d="M12 0 V16 M0 8 H24" stroke="#C8102E" strokeWidth="3.2" />
      </g>
      {[
        [17, 4],
        [20, 8],
        [17, 12],
        [21, 12.5],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.7" fill="white" />
      ))}
    </svg>
  );
}

function CadFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-full w-full">
      <rect width="24" height="16" fill="white" />
      <rect width="6" height="16" fill="#D80621" />
      <rect x="18" width="6" height="16" fill="#D80621" />
      <path d="M12 3 L13 6.5 L16 5.5 L14.5 8.5 L17 9 L14 10.5 L14.5 13 L12 11.5 L9.5 13 L10 10.5 L7 9 L9.5 8.5 L8 5.5 L11 6.5 Z" fill="#D80621" />
    </svg>
  );
}

function NzdFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-full w-full">
      <rect width="24" height="16" fill="#00247D" />
      <g transform="scale(0.5)">
        <rect width="24" height="16" fill="#00247D" />
        <path d="M0 0 L24 16 M24 0 L0 16" stroke="white" strokeWidth="3.2" />
        <path d="M12 0 V16 M0 8 H24" stroke="white" strokeWidth="5.4" />
        <path d="M12 0 V16 M0 8 H24" stroke="#C8102E" strokeWidth="3.2" />
      </g>
      {[
        [16, 4],
        [19, 7],
        [17, 11],
        [20.5, 12.5],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.85" fill="#C8102E" stroke="white" strokeWidth="0.2" />
      ))}
    </svg>
  );
}

function ChfFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-full w-full">
      <rect width="24" height="16" fill="#D52B1E" />
      <rect x="10.5" y="4" width="3" height="8" fill="white" />
      <rect x="7" y="7" width="10" height="2.5" fill="white" />
    </svg>
  );
}

const FLAGS: Record<string, () => ReactElement> = {
  USD: UsdFlag,
  EUR: EurFlag,
  GBP: GbpFlag,
  JPY: JpyFlag,
  AUD: AudFlag,
  CAD: CadFlag,
  NZD: NzdFlag,
  CHF: ChfFlag,
};

export function FlagIcon({
  code,
  className,
  style,
}: {
  code: string;
  className?: string;
  style?: CSSProperties;
}) {
  const Flag = isCurrencyCode(code) ? FLAGS[code] : null;
  if (!Flag) return null;

  return (
    <span
      aria-hidden
      className={className}
      style={{ display: "inline-block", overflow: "hidden", borderRadius: "2px", ...style }}
    >
      <Flag />
    </span>
  );
}
