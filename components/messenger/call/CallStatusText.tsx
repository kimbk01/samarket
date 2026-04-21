"use client";

import { CallTimer } from "./CallTimer";

export function CallStatusText({
  title,
  status,
  timer,
  detail,
}: {
  title: string;
  status: string;
  timer?: string | null;
  detail?: string | null;
}) {
  return (
    <div className="px-6 text-center">
      <h1 className="sam-text-hero font-bold tracking-tight text-white sm:sam-text-hero">{title}</h1>
      <p className="mt-3 sam-text-body-lg font-medium text-white/76 sm:sam-text-section-title">{status}</p>
      <CallTimer value={timer ?? null} className="mt-3" />
      {detail ? <p className="mt-2 sam-text-body-secondary leading-snug text-white/60 sm:sam-text-body">{detail}</p> : null}
    </div>
  );
}
