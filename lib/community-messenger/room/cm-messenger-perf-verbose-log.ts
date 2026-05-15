"use client";

/** room-entry verbose — 다른 room 모듈 import 금지 (순환·TDZ 방지) */

export function cmMessengerPerfVerboseLogEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") return true;
  if (process.env.NEXT_PUBLIC_CM_PROD_PARITY_MODE === "1") return false;
  try {
    return (
      typeof process.env !== "undefined" &&
      (process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_ROOM_ENTRY === "1" ||
        process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE === "1")
    );
  } catch {
    return false;
  }
}

export function cmMessengerPerfVerboseLog(tag: string, payload: unknown): void {
  if (!cmMessengerPerfVerboseLogEnabled()) return;
  if (typeof console === "undefined" || typeof console.debug !== "function") return;
  console.debug(tag, payload);
}
