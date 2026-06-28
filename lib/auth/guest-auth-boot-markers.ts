"use client";

/** Logcat/WebView console — idle soft-guest P0 audit markers. */
export function logGuestAuthBootMarker(
  marker:
    | "app_boot_get_user_empty"
    | "app_boot_profile_authenticated_while_get_user_empty"
    | "app_boot_guest_deferred"
    | "guest_recovery_attempt"
    | "guest_recovery_success"
    | "guest_recovery_failed_terminal"
    | "session_authenticated",
  detail?: Record<string, unknown>,
): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  try {
    console.info(`[${marker}]`, JSON.stringify({ at: Date.now(), ...detail }));
  } catch {
    console.info(`[${marker}]`);
  }
}
