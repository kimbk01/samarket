"use client";

import { CallTimer } from "./CallTimer";

export type ConnectionSignalTier = "good" | "fair" | "poor";

const SIGNAL_BAR_CLASS: Record<ConnectionSignalTier, string> = {
  good: "bg-emerald-400",
  fair: "bg-amber-400",
  poor: "bg-rose-400",
};

function ConnectionSignalIndicator({ tier }: { tier: ConnectionSignalTier }) {
  const activeBars = tier === "good" ? 3 : tier === "fair" ? 2 : 1;
  return (
    <span
      className="inline-flex items-end gap-0.5"
      aria-hidden
      data-testid={`call-connection-signal-${tier}`}
    >
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={`w-1 rounded-sm ${bar <= activeBars ? SIGNAL_BAR_CLASS[tier] : "bg-white/25"}`}
          style={{ height: `${6 + bar * 3}px` }}
        />
      ))}
    </span>
  );
}

export function CallStatusText({
  title,
  status,
  timer,
  detail,
  signalTier,
}: {
  title: string;
  status: string;
  timer?: string | null;
  detail?: string | null;
  signalTier?: ConnectionSignalTier | null;
}) {
  return (
    <div className="px-6 text-center">
      <h1 className="sam-text-hero font-bold tracking-tight text-white sm:sam-text-hero">{title}</h1>
      <p className="mt-3 sam-text-body-lg font-medium text-white/76 sm:sam-text-section-title">{status}</p>
      <CallTimer value={timer ?? null} className="mt-3" />
      {detail ? (
        <div className="mt-2 flex items-center justify-center gap-2">
          {signalTier ? <ConnectionSignalIndicator tier={signalTier} /> : null}
          <p className="sam-text-body-secondary leading-snug text-white/60 sm:sam-text-body">{detail}</p>
        </div>
      ) : null}
    </div>
  );
}
