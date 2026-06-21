"use client";

import { Phone, Video } from "lucide-react";

export function IncomingCallPulse({
  kind = "voice",
  compact = false,
  className = "",
}: {
  kind?: "voice" | "video";
  compact?: boolean;
  className?: string;
}) {
  const Icon = kind === "video" ? Video : Phone;
  return (
    <div
      className={`incoming-call-pulse ${compact ? "incoming-call-pulse--compact" : ""} ${className}`.trim()}
      aria-hidden
    >
      <span className="incoming-call-pulse__ring incoming-call-pulse__ring--one" />
      <span className="incoming-call-pulse__ring incoming-call-pulse__ring--two" />
      <span className="incoming-call-pulse__ring incoming-call-pulse__ring--three" />
      <span className="incoming-call-pulse__core">
        <Icon className="incoming-call-pulse__core-icon text-white" strokeWidth={2.4} />
      </span>
    </div>
  );
}
