"use client";

/**
 * Unexpected SIGNED_OUT recovery — must converge without SIGNED_OUT↔recovering loops.
 *
 * Transition:
 *   unexpected SIGNED_OUT
 *   → recovering (deduped)
 *   → ensureSessionHealthy (single-flight)
 *   → authenticated | corrupt/terminal_guest | transient recovering (5xx/offline only)
 */

let recoveryGeneration = 0;
let recoveryInFlight = false;
let lastSettledGeneration = 0;

export function isUnexpectedSignedOutRecoveryInFlight(): boolean {
  return recoveryInFlight;
}

export function beginUnexpectedSignedOutRecovery(): { generation: number; skipped: boolean } {
  if (recoveryInFlight) {
    return { generation: recoveryGeneration, skipped: true };
  }
  recoveryGeneration += 1;
  recoveryInFlight = true;
  return { generation: recoveryGeneration, skipped: false };
}

export function settleUnexpectedSignedOutRecovery(generation: number): void {
  if (generation !== recoveryGeneration) return;
  recoveryInFlight = false;
  lastSettledGeneration = generation;
}

/**
 * After one health check for unexpected SIGNED_OUT, map to a terminal product phase
 * unless the failure is explicitly transient (5xx / loading preserve).
 */
export function convergeUnexpectedSignedOutHealth(result: {
  ok: boolean;
  phase: string;
  terminal?: boolean;
}): "authenticated" | "corrupt" | "terminal_guest" | "transient_recovering" {
  if (result.ok) return "authenticated";
  if (result.terminal === true || result.phase === "corrupt") return "corrupt";
  if (result.phase === "loading") return "transient_recovering";
  if (result.phase === "terminal_guest") return "terminal_guest";
  return "terminal_guest";
}

/** vitest */
export function resetUnexpectedSignedOutRecoveryForTests(): void {
  recoveryGeneration = 0;
  recoveryInFlight = false;
  lastSettledGeneration = 0;
}

export function getUnexpectedSignedOutRecoveryDebug(): {
  generation: number;
  inFlight: boolean;
  lastSettledGeneration: number;
} {
  return { generation: recoveryGeneration, inFlight: recoveryInFlight, lastSettledGeneration };
}
