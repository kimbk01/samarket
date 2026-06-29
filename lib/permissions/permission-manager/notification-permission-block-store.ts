"use client";

const LS_BLOCKED = "dibay.notification.required_blocked";

export function readNotificationRequiredBlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LS_BLOCKED) === "1";
  } catch {
    return false;
  }
}

export function writeNotificationRequiredBlocked(blocked: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (blocked) {
      window.localStorage.setItem(LS_BLOCKED, "1");
    } else {
      window.localStorage.removeItem(LS_BLOCKED);
    }
  } catch {
    /* ignore */
  }
}

/** User explicitly declined notification guide — blocks receive until settings sync clears. */
export function markNotificationRequiredBlocked(): void {
  writeNotificationRequiredBlocked(true);
}

export function clearNotificationRequiredBlocked(): void {
  writeNotificationRequiredBlocked(false);
}
