"use client";

import { primeClientAuthSessionFromSupabase } from "@/lib/auth/auth-session-immediate.client";
import { logGuestAuthBootMarker } from "@/lib/auth/guest-auth-boot-markers";
import { isRecoverableGuestAuthEstablished } from "@/lib/auth/guest-auth-state";

let recoveryBootstrapRegistered = false;

/**
 * Recoverable boot guest — session prime then registry/refresh retry (dibay-session-manager).
 */
export async function runRecoverableGuestRecovery(source: string): Promise<boolean> {
  if (!isRecoverableGuestAuthEstablished()) return false;
  logGuestAuthBootMarker("guest_recovery_attempt", { source });
  const primed = await primeClientAuthSessionFromSupabase().catch(() => false);
  if (primed) {
    logGuestAuthBootMarker("guest_recovery_success", { source, path: "prime_supabase" });
    return true;
  }
  const { attemptRecoverableGuestSession } = await import("@/lib/auth/dibay-session-manager");
  const result = await attemptRecoverableGuestSession(source);
  if (result.ok) {
    logGuestAuthBootMarker("guest_recovery_success", { source, path: "ensure_session" });
    return true;
  }
  if (result.terminal) {
    logGuestAuthBootMarker("guest_recovery_failed_terminal", { source, phase: result.phase });
  }
  return false;
}

/** visibility / native resume — recoverable boot guest only. */
export function registerRecoverableGuestRecoveryBootstrap(): () => void {
  if (typeof window === "undefined" || recoveryBootstrapRegistered) {
    return () => undefined;
  }
  recoveryBootstrapRegistered = true;

  const onVisible = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;
    if (!isRecoverableGuestAuthEstablished()) return;
    void runRecoverableGuestRecovery("visibility_resume");
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onVisible);

  let detachApp: (() => void) | undefined;
  void import("@capacitor/app")
    .then(({ App }) =>
      App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) return;
        if (!isRecoverableGuestAuthEstablished()) return;
        void runRecoverableGuestRecovery("app_state_active");
      }),
    )
    .then((handle) => {
      detachApp = () => {
        void handle.remove();
      };
    })
    .catch(() => undefined);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", onVisible);
    detachApp?.();
    recoveryBootstrapRegistered = false;
  };
}
