import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import {
  CALL_SERVER_HEARTBEAT_ENDED_REASON,
  CALL_SERVER_HEARTBEAT_STALE_MS,
  type CallSessionHeartbeatRow,
} from "@/lib/call/call-server-heartbeat";
import { canEndActiveCallForPresenceStale } from "@/lib/call/call-active-presence";
import { getCommunityMessengerCallSessionById } from "@/lib/community-messenger/service";
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

/** PATCH action=heartbeat — live active session only */
export async function heartbeatCommunityMessengerCallSession(input: {
  userId: string;
  sessionId: string;
  reconnecting?: boolean;
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
  const patch: Record<string, string | null> = {
    reconnecting_since: input.reconnecting ? ts : null,
  };
  if (isCaller) patch.caller_last_heartbeat_at = ts;
  if (isCallee) patch.callee_last_heartbeat_at = ts;

  const { error } = await (sb as any)
    .from("community_messenger_call_sessions")
    .update(patch)
    .eq("id", sessionId)
    .eq("status", "active");

  if (error) return { ok: false, error: "update_failed" };

  const session = await getCommunityMessengerCallSessionById(userId, sessionId);
  return session ? { ok: true, session } : { ok: false, error: "map_failed" };
}

async function endStaleCallSessionWithPeerNotify(row: CallSessionHeartbeatRow): Promise<boolean> {
  const sid = trimText(row.id);
  const initiator = trimText(row.initiator_user_id);
  if (!sid || !initiator) return false;

  const { updateCommunityMessengerCallSession } = await import("@/lib/community-messenger/service");
  const result = await updateCommunityMessengerCallSession({
    userId: initiator,
    sessionId: sid,
    action: "end",
    clientEndedReason: CALL_SERVER_HEARTBEAT_ENDED_REASON,
  });
  return result.ok;
}

/** Cron/job — end active sessions only when Presence SSOT = STALE (both peers stale). */
export async function cleanupStaleActiveCommunityMessengerCallSessions(): Promise<{ ended: number }> {
  const sb = resolveServiceSupabaseForApi();
  if (!sb) return { ended: 0 };

  const { data: rows } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select(
      "id, status, initiator_user_id, recipient_user_id, answered_at, ended_at, caller_last_heartbeat_at, callee_last_heartbeat_at",
    )
    .eq("status", "active")
    .not("caller_last_heartbeat_at", "is", null)
    .not("callee_last_heartbeat_at", "is", null);

  let ended = 0;
  const nowMs = Date.now();
  for (const row of (rows ?? []) as Array<
    CallSessionHeartbeatRow & { status?: string | null; ended_at?: string | null }
  >) {
    if (
      !canEndActiveCallForPresenceStale(
        {
          status: row.status ?? "active",
          answered_at: row.answered_at,
          ended_at: row.ended_at ?? null,
          caller_last_heartbeat_at: row.caller_last_heartbeat_at,
          callee_last_heartbeat_at: row.callee_last_heartbeat_at,
        },
        nowMs,
      )
    ) {
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
