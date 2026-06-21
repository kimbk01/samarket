"use client";

import { Phone, Video } from "lucide-react";

export function IncomingCallPulse({ kind = "voice", className = "" }: { kind?: "voice" | "video"; className?: string }) {
  const Icon = kind === "video" ? Video : Phone;
  return (
    <div className={`incoming-call-pulse ${className}`.trim()} aria-hidden>
      <span className="incoming-call-pulse__ring incoming-call-pulse__ring--one" />
      <span className="incoming-call-pulse__ring incoming-call-pulse__ring--two" />
      <span className="incoming-call-pulse__ring incoming-call-pulse__ring--three" />
      <span className="incoming-call-pulse__core">
        <Icon className="h-7 w-7 text-white" strokeWidth={2.4} />
      </span>
    </div>
  );
}
