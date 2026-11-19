/**
 * Active-call heartbeat PATCH + stale cleanup (CUT1 Terminal Writer SSOT).
 *
 * Heartbeat never mutates terminal status.
 * Stale end MUST call updateCommunityMessengerCallSession — never SQL direct UPDATE.
 * Presence predicate: canEndActiveCallForPresenceStale (both-stale AND only).
 *
 * Shadow lease: HB may provisionally extend party *_presence_lease_until.
 * That is secondary/compat observation — NOT lease-capability proof.
 * leaseTerminationEligible is logged only; NEVER used for Production end this CUT.
 *
 * @see CALL_TERMINAL_SESSION_WRITER
 */
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import {
  CALL_SERVER_HEARTBEAT_ENDED_REASON,
  CALL_SERVER_HEARTBEAT_STALE_MS,
  type CallSessionHeartbeatRow,
} from "@/lib/call/call-server-heartbeat";
import {
  CALL_MEDIA_NEVER_CONNECTED_ENDED_REASON,
  canEndActiveCallForPresenceStale,
  evaluateActiveCallPresenceDetail,
  isActiveCallMediaNeverConnected,
  shadowPresenceLeaseUntilIso,
} from "@/lib/call/call-active-presence";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function messengerUserIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = trimText(a);
  const right = trimText(b);
  return left.length > 0 && left === right;
}

function nowIso(): string {
  return new Date().toISOString();
}

export type CallSessionHeartbeatPurpose = "active" | "native_lease";

export function resolveCallSessionHeartbeatMutation(purpose?: CallSessionHeartbeatPurpose): {
  purpose: CallSessionHeartbeatPurpose | "legacy_compat";
  writeHeartbeat: boolean;
  writeLease: boolean;
} {
  const resolved =
    purpose === "active" || purpose === "native_lease" ? purpose : "legacy_compat";
  return {
    purpose: resolved,
    writeHeartbeat: resolved !== "native_lease",
    writeLease: resolved !== "active",
  };
}

/** PATCH action=heartbeat — live active session only */
export async function heartbeatCommunityMessengerCallSession(input: {
  userId: string;
  sessionId: string;
  reconnecting?: boolean;
  /**
   * Explicit Native capability signal (Cookie PATCH from Native*CallApi).
   * First successful Native renew with this true establishes lease capability for the party.
   * WebView HB MUST omit / leave false — never infer capability from non-null lease.
   * Does NOT flip Production end authority (still legacy_hb).
   */
  nativePresenceCapable?: boolean;
  /**
   * Semantic split for native calls:
   * - active: production heartbeat only
   * - native_lease: shadow lease only
   * - omitted: legacy compatibility, writes both as before
   */
  heartbeatPurpose?: CallSessionHeartbeatPurpose;
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const sessionId = trimText(input.sessionId);
  const userId = trimText(input.userId);
  if (!sessionId || !userId) return { ok: false, error: "session_required" };

  const sb = resolveServiceSupabaseForApi();
  if (!sb) return { ok: false, error: "db_unavailable" };

  const { data: row } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select("id, initiator_user_id, recipient_user_id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "active") return { ok: false, error: "not_live" };

  const isCaller = messengerUserIdsEqual(row.initiator_user_id, userId);
  const isCallee = messengerUserIdsEqual(row.recipient_user_id, userId);
  if (!isCaller && !isCallee) return { ok: false, error: "forbidden" };

  const ts = nowIso();
  const shadowLeaseUntil = shadowPresenceLeaseUntilIso();
  const nativeCapable = input.nativePresenceCapable === true;
  const { purpose, writeHeartbeat, writeLease } = resolveCallSessionHeartbeatMutation(
    input.heartbeatPurpose,
  );
  const patch: Record<string, string | null> = {
    reconnecting_since: input.reconnecting ? ts : null,
  };
  if (isCaller) {
    if (writeHeartbeat) patch.caller_last_heartbeat_at = ts;
    if (writeLease) patch.caller_presence_lease_until = shadowLeaseUntil;
  }
  if (isCallee) {
    if (writeHeartbeat) patch.callee_last_heartbeat_at = ts;
    if (writeLease) patch.callee_presence_lease_until = shadowLeaseUntil;
  }
  if (nativeCapable) {
    // Capability signal received — LEASE CUTOVER still NO; legacy_hb Production end preserved.
    console.info("[cm-call-presence-native-capable]", {
      sessionId,
      party: isCaller ? "caller" : "callee",
      purpose,
      productionAuthority: "legacy_hb",
      leaseCutover: false,
    });
  }

  const { error } = await (sb as any)
    .from("community_messenger_call_sessions")
    .update(patch)
    .eq("id", sessionId)
    .eq("status", "active");

  if (error) return { ok: false, error: "update_failed" };

  /**
   * F8-1 (docs/audit/supabase-request-surge-2026-11-18/f8-call-session-route-plan-2026-11-19.md · Owner 「승인」 2026-11-19):
   * 성공 뒤 통화 정보를 다시 조립하지 않는다(통화·참가자·프로필 조회 2~3회). 하트비트 응답 본문은 어느 클라이언트도
   * 성공 시 읽지 않는다 — 웹 `call-server-heartbeat-client.ts` `ok` 만 · Android `NativeVoiceCallApi` 상태 코드·실패 `error` 만 ·
   * iOS `patchAsync` 본문 무시. 실패 응답 형태는 그대로.
   */
  return { ok: true };
}

async function endStaleCallSessionWithPeerNotify(
  row: CallSessionHeartbeatRow,
  clientEndedReason: string = CALL_SERVER_HEARTBEAT_ENDED_REASON,
): Promise<boolean> {
  const sid = trimText(row.id);
  const initiator = trimText(row.initiator_user_id);
  if (!sid || !initiator) return false;

  // CUT1: sole terminal writer for heartbeat-stale — updateCommunityMessengerCallSession
  const { updateCommunityMessengerCallSession } = await import("@/lib/community-messenger/service");
  const result = await updateCommunityMessengerCallSession({
    userId: initiator,
    sessionId: sid,
    action: "end",
    clientEndedReason,
  });
  return result.ok;
}

/**
 * Cron/job — end active sessions when
 * ① Presence SSOT = STALE (both peers stale) → heartbeat_timeout, or
 * ② 1:1 통화가 수락 후 30초 지나도 미디어 연결 0(고스트) → failed_network (설계 S4).
 */
export async function cleanupStaleActiveCommunityMessengerCallSessions(): Promise<{ ended: number }> {
  const sb = resolveServiceSupabaseForApi();
  if (!sb) return { ended: 0 };

  // heartbeat 가 비어 있는 행은 ① 에서 UNKNOWN(종료 안 함)이라 조회 조건에서 빼지 않는다 — ② 대상 포함.
  const { data: rows } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select(
      "id, status, session_mode, initiator_user_id, recipient_user_id, answered_at, connected_at, ended_at, caller_last_heartbeat_at, callee_last_heartbeat_at, caller_presence_lease_until, callee_presence_lease_until",
    )
    .eq("status", "active");

  let ended = 0;
  const nowMs = Date.now();
  for (const row of (rows ?? []) as Array<
    CallSessionHeartbeatRow & {
      status?: string | null;
      session_mode?: string | null;
      connected_at?: string | null;
      ended_at?: string | null;
      caller_presence_lease_until?: string | null;
      callee_presence_lease_until?: string | null;
    }
  >) {
    if (isActiveCallMediaNeverConnected(row, nowMs)) {
      const ok = await endStaleCallSessionWithPeerNotify(row, CALL_MEDIA_NEVER_CONNECTED_ENDED_REASON);
      if (ok) ended += 1;
      continue;
    }
    const presenceRow = {
      status: row.status ?? "active",
      answered_at: row.answered_at,
      ended_at: row.ended_at ?? null,
      caller_last_heartbeat_at: row.caller_last_heartbeat_at,
      callee_last_heartbeat_at: row.callee_last_heartbeat_at,
      caller_presence_lease_until: row.caller_presence_lease_until ?? null,
      callee_presence_lease_until: row.callee_presence_lease_until ?? null,
    };
    const detail = evaluateActiveCallPresenceDetail(presenceRow, nowMs);
    // Shadow compare only — leaseTerminationEligible MUST NOT drive end this CUT.
    console.info("[cm-call-presence-shadow]", {
      sessionId: row.id,
      productionAuthority: detail.productionAuthority,
      legacyPresence: detail.legacyPresence,
      leaseEvaluation: detail.leaseEvaluation,
      leasePresence: detail.leasePresence,
      leaseTerminationEligible: detail.leaseTerminationEligible,
    });
    if (!canEndActiveCallForPresenceStale(presenceRow, nowMs)) {
      continue;
    }
    const ok = await endStaleCallSessionWithPeerNotify(row);
    if (ok) ended += 1;
  }
  return { ended };
}

/** Exported for SQL cron mirror — same cutoff semantics */
export function callSessionHeartbeatStaleCutoffIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - CALL_SERVER_HEARTBEAT_STALE_MS).toISOString();
}
