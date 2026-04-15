"use client";

import { useEffect, useMemo, useState } from "react";

function formatCallDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useCallTimer(args: {
  connectedAt?: number | null;
  endedAt?: number | null;
  endedDurationSeconds?: number | null;
}) {
  const { connectedAt = null, endedAt = null, endedDurationSeconds = null } = args;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!connectedAt || endedAt || endedDurationSeconds != null) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connectedAt, endedAt, endedDurationSeconds]);

  return useMemo(() => {
    if (endedDurationSeconds != null) {
      return formatCallDuration(endedDurationSeconds);
    }
    if (!connectedAt) return null;
    const endPoint = endedAt ?? now;
    return formatCallDuration(Math.max(0, (endPoint - connectedAt) / 1000));
  }, [connectedAt, endedAt, endedDurationSeconds, now]);
}
