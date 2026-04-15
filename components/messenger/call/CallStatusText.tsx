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
      <h1 className="text-[32px] font-bold tracking-tight text-white sm:text-[36px]">{title}</h1>
      <p className="mt-3 text-[16px] font-medium text-white/76 sm:text-[17px]">{status}</p>
      <CallTimer value={timer ?? null} className="mt-3" />
      {detail ? <p className="mt-2 text-[13px] leading-snug text-white/60 sm:text-[14px]">{detail}</p> : null}
    </div>
  );
}
