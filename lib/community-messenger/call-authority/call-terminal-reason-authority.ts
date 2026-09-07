/**
 * CUT 3 — Terminal Reason SSOT
 *
 * Layers (must not conflate):
 *   1) DB status          — ringing|active|ended|rejected|missed|cancelled
 *   2) DB ended_reason    — wire string (free text; first terminal wins / CUT1)
 *   3) Canonical reason   — product taxonomy below (THIS MODULE)
 *   4) Viewer presentation — CUT4 call-event-presentation (reads canonical)
 *
 * Canonical taxonomy (product):
 *   caller_cancelled | callee_rejected | missed_timeout | busy
 *   ended_by_caller | ended_by_callee | disconnected
 *   failed_setup | failed_network | answered_elsewhere | superseded
 *
 * Classification of raw tokens (inventory):
 *   CANONICAL wire/read: declined→callee_rejected, canceled→caller_cancelled,
 *     missed→missed_timeout, ended(+actor)→ended_by_*, heartbeat_timeout→disconnected
 *   LEGACY_ALIAS: cancelled, reject, timeout, ring_timeout, no_answer, caller_cancel, …
 *   INFRA_INTERNAL (wire preserved, canonical folded):
 *     stale_ringing_expired, reconcile_stale_*, redial_replaced,
 *     incoming_policy_superseded, failed_permission|ice|signaling|insecure_context
 *   DEVICE_PRESENTATION_ONLY / API outcome (not session terminal write):
 *     answered_elsewhere, peer_busy
 *   ERROR_CODE → failed_setup | failed_network (phase-aware on read)
 *
 * Wire values written to ended_reason stay legacy-compatible where possible
 * (declined, canceled, missed, ended, failed_*, heartbeat_timeout, …).
 * When actor+answered are known on end/leave, wire may be ended_by_caller|ended_by_callee.
 * Readers MUST use resolveCanonicalTerminalReason — never raw substring.
 *
 * CUT1/CUT2 locks preserved: writer = updateCommunityMessengerCallSession;
 * missed deadline gate unchanged.
 */

import type { CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";

/** Product-facing canonical terminal reasons (CUT3). */
export const CANONICAL_TERMINAL_REASONS = [
  "caller_cancelled",
  "callee_rejected",
  "missed_timeout",
  "busy",
  "ended_by_caller",
  "ended_by_callee",
  "disconnected",
  "failed_setup",
  "failed_network",
  "answered_elsewhere",
  "superseded",
] as const;

export type CanonicalTerminalReason = (typeof CANONICAL_TERMINAL_REASONS)[number];

/** Server-trusted clientEndedReason values that may override default ended_reason on write. */
export const TRUSTED_CLIENT_ENDED_REASONS = [
  "failed_permission",
  "failed_insecure_context",
  "failed_ice",
  "failed_network",
  "failed_signaling",
  "heartbeat_timeout",
  "redial_replaced",
  "stale_ringing_expired",
  "incoming_policy_superseded",
  "reconcile_stale_ringing",
  "reconcile_stale_active",
] as const;

export type TrustedClientEndedReason = (typeof TRUSTED_CLIENT_ENDED_REASONS)[number];

/** Synonyms / legacy wire → normalized trusted or default wire token. */
const CLIENT_REASON_ALIASES: Record<string, string> = {
  cancelled: "canceled",
  cancel: "canceled",
  caller_cancel: "canceled",
  caller_cancelled: "canceled",
  declined: "declined",
  reject: "declined",
  rejected: "declined",
  callee_reject: "declined",
  callee_rejected: "declined",
  timeout: "missed",
  ring_timeout: "missed",
  missed_timeout: "missed",
  no_answer: "missed",
  peer_busy: "peer_busy",
  callee_busy: "peer_busy",
  busy: "peer_busy",
  answered_elsewhere: "answered_elsewhere",
  network_lost: "failed_network",
  disconnected: "heartbeat_timeout",
  disconnect: "heartbeat_timeout",
  ended_by_caller: "ended_by_caller",
  ended_by_callee: "ended_by_callee",
};

export function isTrustedClientEndedReason(value: string | null | undefined): value is TrustedClientEndedReason {
  const v = normalizeIncomingReasonToken(value);
  return (TRUSTED_CLIENT_ENDED_REASONS as readonly string[]).includes(v);
}

export function isCanonicalTerminalReason(value: string | null | undefined): value is CanonicalTerminalReason {
  const v = typeof value === "string" ? value.trim() : "";
  return (CANONICAL_TERMINAL_REASONS as readonly string[]).includes(v);
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasAnsweredAt(answeredAt: string | null | undefined): boolean {
  return typeof answeredAt === "string" && answeredAt.trim().length > 0;
}

/** Lowercase + alias fold for client/server reason tokens. */
export function normalizeIncomingReasonToken(value: string | null | undefined): string {
  const raw = trimText(value).toLowerCase();
  if (!raw) return "";
  return CLIENT_REASON_ALIASES[raw] ?? raw;
}

/**
 * Default ended_reason wire from action → next status.
 * Spelling: status uses UK `cancelled`; reason uses US `canceled` (legacy DB rows).
 * When end/leave after answer and actor is known, prefer ended_by_caller|ended_by_callee.
 */
export function resolveDefaultEndedReason(
  action: "accept" | "reject" | "cancel" | "end" | "leave" | "missed",
  nextStatus: CommunityMessengerCallSessionStatus,
  opts?: {
    actorUserId?: string | null;
    initiatorUserId?: string | null;
    recipientUserId?: string | null;
    answeredAt?: string | null;
  },
): string | null {
  if (nextStatus === "active" || nextStatus === "ringing") return null;
  if (nextStatus === "rejected") return "declined";
  if (nextStatus === "cancelled") return "canceled";
  if (nextStatus === "missed") return "missed";
  if (nextStatus === "ended") {
    if (action === "cancel") return "canceled";
    if (hasAnsweredAt(opts?.answeredAt)) {
      const actor = trimText(opts?.actorUserId);
      const initiator = trimText(opts?.initiatorUserId);
      const recipient = trimText(opts?.recipientUserId);
      if (actor && recipient && actor === recipient) return "ended_by_callee";
      if (actor && initiator && actor === initiator) return "ended_by_caller";
    }
    return "ended";
  }
  return null;
}

/**
 * Normalize trusted client reason to the wire string stored on the session.
 * Missed-timeout synonyms collapse to `missed` (CUT2 deadline path).
 */
export function resolveWireEndedReasonFromTrustedClient(
  clientEndedReason: string,
  nextStatus: CommunityMessengerCallSessionStatus,
): string {
  const client = normalizeIncomingReasonToken(clientEndedReason);
  if (nextStatus === "missed") {
    if (
      client === "stale_ringing_expired" ||
      client === "reconcile_stale_ringing" ||
      client === "missed" ||
      client === "timeout"
    ) {
      return "missed";
    }
  }
  if (nextStatus === "ended") {
    if (client === "reconcile_stale_active") return "heartbeat_timeout";
  }
  return client;
}

/**
 * Resolve ended_reason wire for a terminal write (CUT1 writer only).
 * Trusted client reasons win on ended/cancelled/missed; synonyms normalized.
 */
export function resolveTerminalEndedReason(input: {
  action: "accept" | "reject" | "cancel" | "end" | "leave" | "missed";
  nextStatus: CommunityMessengerCallSessionStatus;
  clientEndedReason?: string | null;
  actorUserId?: string | null;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
  answeredAt?: string | null;
}): string | null {
  const client = normalizeIncomingReasonToken(input.clientEndedReason);
  if (client && isTrustedClientEndedReason(client)) {
    if (input.nextStatus === "ended" || input.nextStatus === "cancelled" || input.nextStatus === "missed") {
      return resolveWireEndedReasonFromTrustedClient(client, input.nextStatus);
    }
  }
  return resolveDefaultEndedReason(input.action, input.nextStatus, {
    actorUserId: input.actorUserId,
    initiatorUserId: input.initiatorUserId,
    recipientUserId: input.recipientUserId,
    answeredAt: input.answeredAt,
  });
}

export type ResolveCanonicalTerminalReasonInput = {
  status: string | null | undefined;
  endedReason?: string | null;
  /** Who performed the terminal action (end/leave). Optional. */
  terminalActorUserId?: string | null;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
  /** Phase: post-answer network loss → disconnected. */
  answeredAt?: string | null;
  /** Non-session outcomes (API / device presentation). */
  apiError?: string | null;
};

/**
 * Single reader SSOT: status + wire reason (+ optional actor/phase) → canonical taxonomy.
 */
export function resolveCanonicalTerminalReason(
  input: ResolveCanonicalTerminalReasonInput,
): CanonicalTerminalReason | null {
  const apiErr = normalizeIncomingReasonToken(input.apiError);
  if (apiErr === "peer_busy") return "busy";
  if (apiErr === "answered_elsewhere") return "answered_elsewhere";

  const status = trimText(input.status).toLowerCase();
  const er = normalizeIncomingReasonToken(input.endedReason);
  const answered = hasAnsweredAt(input.answeredAt);

  if (er === "answered_elsewhere") return "answered_elsewhere";
  if (er === "peer_busy") return "busy";

  if (status === "rejected") return "callee_rejected";
  if (status === "cancelled") return "caller_cancelled";

  if (status === "missed" || status === "timeout") return "missed_timeout";

  if (er === "redial_replaced" || er === "incoming_policy_superseded") return "superseded";

  if (er === "ended_by_callee") return "ended_by_callee";
  if (er === "ended_by_caller") return "ended_by_caller";

  if (status === "ended" || status === "failed") {
    if (er === "heartbeat_timeout" || er === "reconcile_stale_active") return "disconnected";
    if (er === "failed_network") {
      // Post-connect network loss is product "disconnected"; pre-connect stays failed_network.
      return answered ? "disconnected" : "failed_network";
    }
    if (er.startsWith("failed_")) return "failed_setup";
    if (er === "canceled" || er === "cancelled") return "caller_cancelled";
    if (er === "declined") return "callee_rejected";

    const actor = trimText(input.terminalActorUserId);
    const initiator = trimText(input.initiatorUserId);
    const recipient = trimText(input.recipientUserId);
    if (actor && recipient && actor === recipient) return "ended_by_callee";
    if (actor && initiator && actor === initiator) return "ended_by_caller";
    // Actor unknown — default to caller-end (legacy local_ended bias); CUT6 may refine.
    return "ended_by_caller";
  }

  if (!status && er) {
    if (er === "declined") return "callee_rejected";
    if (er === "canceled") return "caller_cancelled";
    if (er === "missed") return "missed_timeout";
    if (er === "heartbeat_timeout") return "disconnected";
    if (er === "failed_network") return answered ? "disconnected" : "failed_network";
    if (er.startsWith("failed_")) return "failed_setup";
    if (er === "ended_by_callee") return "ended_by_callee";
    if (er === "ended_by_caller") return "ended_by_caller";
  }

  return null;
}

/**
 * @deprecated Prefer resolveCanonicalTerminalReason. Kept as alias for existing imports.
 * Historical product labels (ring_timeout / local_ended / network_lost) map to CUT3 names.
 */
export function mapStoredToProductEndReason(input: {
  status: string;
  endedReason?: string | null;
  terminalActorUserId?: string | null;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
  answeredAt?: string | null;
}): string {
  const canonical = resolveCanonicalTerminalReason(input);
  if (canonical) return canonical;
  const status = trimText(input.status);
  return status || "invalid_session";
}

/** Whether this canonical reason is a ring-timeout miss (CUT2). */
export function isMissedTimeoutCanonical(reason: CanonicalTerminalReason | null | undefined): boolean {
  return reason === "missed_timeout";
}
