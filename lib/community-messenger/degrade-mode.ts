"use client";

/**
 * Runtime degrade mode for messenger.
 *
 * Goal: when ops indicates instability or during incident response, we can reduce
 * background work (prefetch/polling) without code changes.
 *
 * - `NEXT_PUBLIC_SAMARKET_MESSENGER_DEGRADE=1`: always degrade
 * - session override: `sessionStorage["samarket:messenger:degrade"]= "1" | "0"`
 */

const SESSION_KEY = "samarket:messenger:degrade";

export function isMessengerDegradeMode(): boolean {
  if (typeof window !== "undefined") {
    try {
      const v = sessionStorage.getItem(SESSION_KEY);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch {
      /* ignore */
    }
  }
  const env = process.env.NEXT_PUBLIC_SAMARKET_MESSENGER_DEGRADE;
  return String(env ?? "").trim() === "1";
}

export function setMessengerDegradeMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

