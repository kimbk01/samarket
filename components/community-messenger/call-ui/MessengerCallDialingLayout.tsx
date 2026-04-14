"use client";

import type { ReactNode } from "react";

function peerDisplayInitial(label: string): string {
  const t = label.trim();
  if (!t) return "?";
  const first = [...t][0];
  return first ?? "?";
}

function DialHangupIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g transform="rotate(135 12 12)">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </g>
    </svg>
  );
}

export type MessengerCallDialingLayoutProps = {
  peerLabel: string;
  kindLabel: string;
  onCancel: () => void;
  onEndCall: () => void;
  primaryStatus?: string;
  secondaryStatus?: string;
  /** Nested in session page: flex-1 column instead of min-h-screen */
  embedded?: boolean;
  endCallBusy?: boolean;
  children?: ReactNode;
};

/** Outgoing ring UI shared with `/calls/outgoing` bootstrap shell */
export function MessengerCallDialingLayout({
  peerLabel,
  kindLabel,
  onCancel,
  onEndCall,
  primaryStatus = "\uBC1C\uC2E0 \uC911\u2026",
  secondaryStatus = "\uC5F0\uACB0\uC744 \uC900\uBE44\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4",
  embedded = false,
  endCallBusy = false,
  children,
}: MessengerCallDialingLayoutProps) {
  const initial = peerDisplayInitial(peerLabel);
  const rootClass = embedded
    ? "flex min-h-0 flex-1 flex-col justify-between px-2 pb-[max(16px,calc(env(safe-area-inset-bottom)+12px))] pt-1 text-center"
    : "flex min-h-[100dvh] flex-col justify-between px-6 pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-[max(24px,calc(env(safe-area-inset-top)+12px))] text-center";

  return (
    <div className={rootClass}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[13px] font-medium text-white/90 transition active:scale-[0.98]"
          onClick={onCancel}
        >
          {"\uCDE8\uC18C"}
        </button>
        <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold text-white/85">{kindLabel}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-white/10 text-[44px] font-semibold text-white shadow-[0_0_0_18px_rgba(255,255,255,0.05)]">
          <div className="absolute inset-[-14px] rounded-full border border-white/20 animate-pulse" aria-hidden />
          {initial}
        </div>
        <p className="mt-8 text-[26px] font-semibold tracking-tight text-white">{peerLabel}</p>
        <p className="mt-2 text-[14px] text-white/75">{kindLabel}</p>
        <p className="mt-10 text-[16px] font-medium text-white/92">{primaryStatus}</p>
        <p className="mt-2 text-[13px] text-white/60">{secondaryStatus}</p>
        {children}
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-[#e5394a] text-white shadow-[0_12px_40px_rgba(229,57,74,0.45)] transition active:scale-95 disabled:opacity-40"
          onClick={onEndCall}
          disabled={endCallBusy}
          aria-label={"\uD1B5\uD654 \uCDE8\uC18C"}
        >
          <DialHangupIcon className="h-8 w-8" />
        </button>
      </div>
    </div>
  );
}
