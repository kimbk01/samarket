/**
 * CUT 2 — Server Missed Deadline Authority
 *
 * WHO MAY DECIDE MISSED? → server only, via updateCommunityMessengerCallSession.
 *
 * Canonical deadline:
 *   ring_start = community_messenger_call_sessions.started_at
 *   ring_timeout_seconds = admin_messenger_call_sound_settings.incoming_ring_timeout_seconds
 *                         (default DEFAULT_INCOMING_RING_TIMEOUT_SECONDS = 30)
 *   ring_deadline = started_at + timeout
 *
 * Server / DB evaluation clock only. Client timers may PROPOSE missed PATCH after
 * local UX timeout; server rejects if deadline not reached.
 *
 * Push expires_at / FCM TTL ≠ missed authority (delivery suppress only).
 *
 * @see CALL_TERMINAL_SESSION_WRITER (CUT1)
 */

import type { MessengerCallAdminPolicy } from "@/lib/community-messenger/messenger-call-admin-policy";
import {
  DEFAULT_INCOMING_RING_TIMEOUT_SECONDS,
  clampIncomingRingTimeoutSeconds,
} from "@/lib/community-messenger/messenger-call-ring-timeout";

export const CALL_MISSED_DEADLINE_CONFIG_OWNER =
  "admin_messenger_call_sound_settings.incoming_ring_timeout_seconds" as const;

export const CALL_MISSED_RING_START_COLUMN = "started_at" as const;

export type MissedTransitionGateInput = {
  status: string | null | undefined;
  startedAt: string | null | undefined;
  answeredAt?: string | null | undefined;
  answeredDeviceId?: string | null | undefined;
  endedAt?: string | null | undefined;
  ringTimeoutSeconds: number;
  nowMs?: number;
};

export type MissedTransitionGateResult =
  | { ok: true }
  | { ok: false; error: "bad_action" | "ring_deadline_not_reached" | "already_answered" }
  | { ok: false; error: "idempotent_missed"; idempotent: true };

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveCanonicalRingTimeoutSeconds(
  policy: Pick<MessengerCallAdminPolicy, "incoming_ring_timeout_seconds"> | null | undefined,
): number {
  return clampIncomingRingTimeoutSeconds(
    policy?.incoming_ring_timeout_seconds ?? DEFAULT_INCOMING_RING_TIMEOUT_SECONDS,
  );
}

/** Ring deadline ms from started_at + timeout. Invalid start → null (never auto-miss). */
export function resolveRingDeadlineMs(
  startedAt: string | null | undefined,
  ringTimeoutSeconds: number,
): number | null {
  const startMs = new Date(trimText(startedAt) || "").getTime();
  if (!Number.isFinite(startMs)) return null;
  const timeoutSec = clampIncomingRingTimeoutSeconds(ringTimeoutSeconds);
  return startMs + timeoutSec * 1000;
}

/** True when server clock is past canonical ringing deadline. */
export function isRingingMissedDeadlineReached(
  startedAt: string | null | undefined,
  ringTimeoutSeconds: number,
  nowMs: number = Date.now(),
): boolean {
  const deadlineMs = resolveRingDeadlineMs(startedAt, ringTimeoutSeconds);
  if (deadlineMs == null) return false;
  return nowMs >= deadlineMs;
}

/**
 * Gate for action=missed → status=missed.
 * Does not mutate. Caller must still apply FIRST VALID TERMINAL CAS.
 */
export function evaluateMissedTransitionGate(input: MissedTransitionGateInput): MissedTransitionGateResult {
  const status = trimText(input.status);
  const nowMs = input.nowMs ?? Date.now();

  if (status === "missed") {
    return { ok: false, error: "idempotent_missed", idempotent: true };
  }

  if (status !== "ringing") {
    return { ok: false, error: "bad_action" };
  }

  if (trimText(input.endedAt ?? "")) {
    return { ok: false, error: "bad_action" };
  }

  if (trimText(input.answeredAt ?? "") || trimText(input.answeredDeviceId ?? "")) {
    return { ok: false, error: "already_answered" };
  }

  if (!isRingingMissedDeadlineReached(input.startedAt, input.ringTimeoutSeconds, nowMs)) {
    return { ok: false, error: "ring_deadline_not_reached" };
  }

  return { ok: true };
}

/** Policy helper used by cleanup/reconcile. */
export function isCanonicalRingingExpiredForMissed(
  startedAt: string | null | undefined,
  policy: Pick<MessengerCallAdminPolicy, "incoming_ring_timeout_seconds">,
  nowMs: number = Date.now(),
): boolean {
  return isRingingMissedDeadlineReached(
    startedAt,
    resolveCanonicalRingTimeoutSeconds(policy),
    nowMs,
  );
}
