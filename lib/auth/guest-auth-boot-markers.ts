"use client";

/** Logcat/WebView console — idle soft-guest P0 audit markers. */
export function logGuestAuthBootMarker(
  marker:
    | "app_boot_get_user_empty"
    | "app_boot_recovering_no_supabase_user"
    | "app_boot_profile_authenticated_while_get_user_empty"
    | "app_boot_guest_deferred"
    | "app_boot_recovery_profile_ok"
    | "app_boot_recovery_authenticated"
    | "app_boot_terminal_guest_confirmed"
    | "guest_recovery_attempt"
    | "guest_recovery_success"
    | "guest_recovery_failed_terminal"
    | "session_authenticated"
    | "session_recovering"
    | "initial_session_empty_recovering"
    | "initial_session_empty_no_wipe"
    | "initial_session_recovered_authenticated"
    | "recovery_session_check_start"
    | "recovery_session_check_done"
    | "guest_fetch_allowed_recovering"
    | "guest_fetch_skipped_terminal_guest"
    | "cookie_sync_after_login_done"
    | "push_register_deferred_recovering"
    | "push_register_start_authenticated"
    | "push_register_success_authenticated"
    | "push_register_skipped_terminal_guest"
    | "user_device_active_after_login"
    | "terminal_guest_after_explicit_logout"
    | "push_register_skipped_guest"
    | "signed_out_terminal_guest"
    | "signed_out_unexpected_recovering"
    | "signed_out_unexpected_no_wipe"
    | "signed_out_unexpected_deduped"
    | "signed_out_unexpected_converged",
  detail?: Record<string, unknown>,
): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  try {
    console.info(`[${marker}]`, JSON.stringify({ at: Date.now(), ...detail }));
  } catch {
    console.info(`[${marker}]`);
  }
}
