/**
 * DIBAY Call Active Presence SSOT.
 *
 * HEARTBEAT_SEMANTICS = secondary / WebView-JS observability + compat renew.
 * Per-party presence lease = future participant-liveness SSOT (shadow this CUT).
 *
 * Server caller/callee_last_heartbeat_at is WebView-JS PATCH only — not media
 * connectivity. One-sided HB stale MUST NOT end a session when the other peer
 * is fresh (2026-09-01 production regression).
 *
 * LEASE STATE (`*_presence_lease_until`) ≠ LEASE CAPABILITY.
 * NON_NULL lease columns MUST NEVER imply lease-capable / Production lease authority.
 * Production authority this generation: legacy_hb always; leaseEvaluation = shadow only.
 * LEASE CUTOVER: NO until Native renew runtime is Production-proven.
 *
 * Native Capability CUT: authoritative renew is Native Cookie PATCH heartbeat with
 * `nativePresenceCapable: true` (first successful Native renew establishes capability).
 * WebView HB without that flag remains secondary/compat — never capability proof.
 *
 * reconcile stale-active end and heartbeat cleanup MUST both consume
 * `canEndActiveCallForPresenceStale` (legacy HB both-stale) for Production end.
 */

import {
  CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS,
  CALL_SERVER_HEARTBEAT_STALE_MS,
} from "@/lib/call/call-server-heartbeat";

export const CALL_ACTIVE_PRESENCE_FRESH_MS = CALL_SERVER_HEARTBEAT_STALE_MS;

/**
 * PROVISIONAL · SHADOW · NOT_PRODUCTION_TERMINATION_AUTHORITY
 *
 * Writer/shadow TTL only — Accept seed + WebView HB lease extend.
 * MUST NOT be wired as cleanup / Production termination threshold.
 * Dependency from cleanup end decision → TEST FAIL.
 */
export const CALL_PRESENCE_SHADOW_LEASE_TTL_MS = 300_000;

/**
 * Native sparse renew cadence — MUST stay derived from shadow lease TTL.
 * Android/iOS named constants MUST mirror this value (TTL / 2).
 * NOT a 10s heartbeat clone. NOT Production termination authority.
 */
export const CALL_PRESENCE_NATIVE_RENEW_INTERVAL_MS = Math.floor(
  CALL_PRESENCE_SHADOW_LEASE_TTL_MS / 2,
);

/** Body flag on Native Cookie PATCH heartbeat — capability signal (not UA/version/non-null lease). */
export const CALL_PRESENCE_NATIVE_CAPABLE_BODY_KEY = "nativePresenceCapable" as const;

export type ActiveCallPresence = "LIVE" | "STALE" | "UNKNOWN";

export type PartyLeaseState = "VALID" | "EXPIRED" | "LEASE_UNKNOWN";

export type ActiveCallPresenceRow = {
  status?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  caller_last_heartbeat_at?: string | null;
  callee_last_heartbeat_at?: string | null;
  caller_presence_lease_until?: string | null;
  callee_presence_lease_until?: string | null;
};

export type ActiveCallPresenceDetail = {
  /** This CUT: always legacy_hb. NON_NULL leases do NOT flip this. */
  productionAuthority: "legacy_hb";
  legacyPresence: ActiveCallPresence;
  /** This CUT: shadow evaluation only — never Production end authority. */
  leaseEvaluation: "shadow";
  leasePresence: ActiveCallPresence;
  /** Shadow only — cleanup MUST NOT end via this flag this CUT. */
  leaseTerminationEligible: boolean;
  callerLease: PartyLeaseState;
  calleeLease: PartyLeaseState;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toMs(value: string | null | undefined): number | null {
  const raw = trimText(value ?? "");
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function isFreshHb(hbMs: number | null, nowMs: number, freshMs: number): boolean {
  if (hbMs == null) return false;
  return nowMs - hbMs <= freshMs;
}

function partyLeaseState(leaseUntil: string | null | undefined, nowMs: number): PartyLeaseState {
  const untilMs = toMs(leaseUntil);
  if (untilMs == null) return "LEASE_UNKNOWN";
  return untilMs > nowMs ? "VALID" : "EXPIRED";
}

/** Shadow lease writer helper — provisional TTL only. */
export function shadowPresenceLeaseUntilIso(nowMs: number = Date.now()): string {
  return new Date(nowMs + CALL_PRESENCE_SHADOW_LEASE_TTL_MS).toISOString();
}

/**
 * Canonical presence for an answered active session (Production = legacy HB).
 *
 * LIVE — at least one peer HB within freshness window
 * STALE — both HBs seeded and both outside freshness (after answer grace)
 * UNKNOWN — not active/answered, missing seed, or ambiguous — never treat as dead
 */
export function evaluateActiveCallPresence(
  row: ActiveCallPresenceRow,
  nowMs: number = Date.now(),
  freshMs: number = CALL_ACTIVE_PRESENCE_FRESH_MS,
): ActiveCallPresence {
  if (trimText(row.status) !== "active") return "UNKNOWN";
  if (trimText(row.ended_at ?? "")) return "UNKNOWN";

  const answeredMs = toMs(row.answered_at);
  if (answeredMs == null) return "UNKNOWN";

  const callerMs = toMs(row.caller_last_heartbeat_at);
  const calleeMs = toMs(row.callee_last_heartbeat_at);

  const callerFresh = isFreshHb(callerMs, nowMs, freshMs);
  const calleeFresh = isFreshHb(calleeMs, nowMs, freshMs);
  if (callerFresh || calleeFresh) return "LIVE";

  if (callerMs == null || calleeMs == null) return "UNKNOWN";

  if (nowMs - answeredMs < CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS) {
    return "UNKNOWN";
  }

  return "STALE";
}

/**
 * Shadow lease evaluation. Does NOT confer Production authority or capability.
 * NON_NULL lease fields alone ≠ lease-capable.
 */
function evaluateShadowLeasePresence(
  row: ActiveCallPresenceRow,
  nowMs: number,
): {
  leasePresence: ActiveCallPresence;
  leaseTerminationEligible: boolean;
  callerLease: PartyLeaseState;
  calleeLease: PartyLeaseState;
} {
  const callerLease = partyLeaseState(row.caller_presence_lease_until, nowMs);
  const calleeLease = partyLeaseState(row.callee_presence_lease_until, nowMs);

  if (trimText(row.status) !== "active" || trimText(row.ended_at ?? "")) {
    return {
      leasePresence: "UNKNOWN",
      leaseTerminationEligible: false,
      callerLease,
      calleeLease,
    };
  }

  const answeredMs = toMs(row.answered_at);
  if (answeredMs == null) {
    return {
      leasePresence: "UNKNOWN",
      leaseTerminationEligible: false,
      callerLease,
      calleeLease,
    };
  }

  if (callerLease === "LEASE_UNKNOWN" || calleeLease === "LEASE_UNKNOWN") {
    return {
      leasePresence: "UNKNOWN",
      leaseTerminationEligible: false,
      callerLease,
      calleeLease,
    };
  }

  if (callerLease === "VALID" || calleeLease === "VALID") {
    return {
      leasePresence: "LIVE",
      leaseTerminationEligible: false,
      callerLease,
      calleeLease,
    };
  }

  // both EXPIRED
  if (nowMs - answeredMs < CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS) {
    return {
      leasePresence: "UNKNOWN",
      leaseTerminationEligible: false,
      callerLease,
      calleeLease,
    };
  }

  return {
    leasePresence: "STALE",
    leaseTerminationEligible: true,
    callerLease,
    calleeLease,
  };
}

/**
 * Detail API: Production authority stays legacy_hb; lease is shadow-only.
 * Computing lease outcome MUST NOT flip Production authority to lease.
 */
export function evaluateActiveCallPresenceDetail(
  row: ActiveCallPresenceRow,
  nowMs: number = Date.now(),
  freshMs: number = CALL_ACTIVE_PRESENCE_FRESH_MS,
): ActiveCallPresenceDetail {
  const legacyPresence = evaluateActiveCallPresence(row, nowMs, freshMs);
  const shadow = evaluateShadowLeasePresence(row, nowMs);
  return {
    productionAuthority: "legacy_hb",
    legacyPresence,
    leaseEvaluation: "shadow",
    leasePresence: shadow.leasePresence,
    leaseTerminationEligible: shadow.leaseTerminationEligible,
    callerLease: shadow.callerLease,
    calleeLease: shadow.calleeLease,
  };
}

/** True only when Presence SSOT says STALE — shared by reconcile + cleanup. */
export function canEndActiveCallForPresenceStale(
  row: ActiveCallPresenceRow,
  nowMs: number = Date.now(),
): boolean {
  return evaluateActiveCallPresence(row, nowMs) === "STALE";
}
