import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function ChevronLeft(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-icon" {...stroke} {...props}>
      <path d="M10 3 5 8l5 5" />
    </svg>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-icon" {...stroke} {...props}>
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden="true"
      className="size-icon-sm"
      fill="currentColor"
      {...props}
    >
      <path d="M3 2h3v10H3zM8 2h3v10H8z" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden="true"
      className="size-icon-sm"
      fill="currentColor"
      {...props}
    >
      <path d="M3 2l9 5-9 5z" />
    </svg>
  );
}

/** The trace-through-a-heartbeat mark from the mock-up. */
export function Logo(props: IconProps) {
  return (
    <svg
      viewBox="0 0 30 30"
      aria-hidden="true"
      className="size-logo text-trace-ecg"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2 16h6l3-9 4 16 3-8h10" />
    </svg>
  );
}
