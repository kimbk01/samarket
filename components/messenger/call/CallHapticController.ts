"use client";

type CallHapticKind = "selection" | "impactMedium";

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function triggerCallHaptic(kind: CallHapticKind = "selection"): void {
  try {
    if (!canVibrate()) return;
    navigator.vibrate(kind === "impactMedium" ? 14 : 10);
  } catch {
    /* noop: unsupported browsers/native shells should ignore haptics */
  }
}
