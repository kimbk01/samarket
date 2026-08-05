/**
 * Native App Icon write gate — Boot flicker contract.
 *
 * - Incomplete Projection must not Badge.clear / set(0).
 * - Store initial appIconTotal=0 is not authoritative zero.
 * - Cap resume cache is never final authority (Gate3 Step11).
 * - Explicit terminal_guest (logout) may clear immediately.
 */
import type { DibaySessionPhase } from "@/lib/auth/dibay-session-policy";
import type { ProjectionAuthorityState } from "@/lib/notifications/projection-authority";

export type NativeBadgeSyncWriteDecision =
  | { kind: "hold"; reason: "boot_incomplete" | "session_transient" }
  | { kind: "clear_logout"; reason: "terminal_guest" }
  | { kind: "echo_authority"; reason: "complete_snapshot" };

export function resolveNativeBadgeSyncWrite(input: {
  sessionPhase: DibaySessionPhase;
  projectionState: ProjectionAuthorityState;
}): NativeBadgeSyncWriteDecision {
  if (input.sessionPhase === "terminal_guest") {
    return { kind: "clear_logout", reason: "terminal_guest" };
  }
  if (input.sessionPhase !== "authenticated") {
    // loading / recovering / corrupt — preserve launcher until identity+COMPLETE settle.
    return { kind: "hold", reason: "session_transient" };
  }
  if (input.projectionState !== "COMPLETE") {
    return { kind: "hold", reason: "boot_incomplete" };
  }
  return { kind: "echo_authority", reason: "complete_snapshot" };
}
