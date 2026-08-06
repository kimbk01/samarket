"use client";

/** Explicit logout audit markers — Logcat/WebView console. */
export type ExplicitLogoutAuditMarker =
  | "explicit_logout_start"
  | "explicit_logout_context"
  | "logout_device_deactivate_start"
  | "logout_device_deactivate_done"
  | "logout_device_deactivate_failed"
  | "auth_logout_server_start"
  | "auth_logout_server_done"
  | "client_session_wipe_after_logout"
  | "terminal_guest_after_explicit_logout"
  | "native_badge_clear_start"
  | "native_badge_clear_done"
  | "native_badge_clear_failed"
  | "native_badge_clear_timed_out";

export function logExplicitLogoutAudit(
  marker: ExplicitLogoutAuditMarker,
  detail?: Record<string, unknown>,
): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  try {
    console.info(`[${marker}]`, JSON.stringify({ at: Date.now(), ...detail }));
  } catch {
    console.info(`[${marker}]`);
  }
}
