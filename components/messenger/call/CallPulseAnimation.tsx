"use client";

import { Phone } from "lucide-react";

export function CallPulseAnimation({ className = "" }: { className?: string }) {
  return (
    <div className={`call-pulse ${className}`.trim()} aria-hidden>
      <span className="call-pulse__ring call-pulse__ring--one" />
      <span className="call-pulse__ring call-pulse__ring--two" />
      <span className="call-pulse__ring call-pulse__ring--three" />
      <span className="call-pulse__core">
        <Phone className="h-7 w-7 text-white" strokeWidth={2.4} />
      </span>
    </div>
  );
}
