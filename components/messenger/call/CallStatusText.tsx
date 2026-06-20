"use client";

import { CallTimer } from "./CallTimer";

export function CallStatusText({
  title,
  status,
  timer,
  detail,
  connectionStatusLabel,
}: {
  title: string;
  status: string;
  timer?: string | null;
  detail?: string | null;
  connectionStatusLabel?: string | null;
}) {
  return (
    <div className="px-6 text-center">
      <h1 className="sam-text-hero font-bold tracking-tight text-white sm:sam-text-hero">{title}</h1>
      {connectionStatusLabel ? (
        <span className="mt-4 inline-flex max-w-[min(100%,20rem)] items-center justify-center rounded-full border border-white/20 bg-black/20 px-3 py-1 sam-text-body-secondary font-medium text-white/88">
          {connectionStatusLabel}
        </span>
      ) : null}
      <p className="mt-3 sam-text-body-lg font-medium text-white/76 sm:sam-text-section-title">{status}</p>
      <CallTimer value={timer ?? null} className="mt-3" />
      {detail ? <p className="mt-2 sam-text-body-secondary leading-snug text-white/60 sm:sam-text-body">{detail}</p> : null}
    </div>
  );
}
