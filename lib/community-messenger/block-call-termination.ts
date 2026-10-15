/**
 * 차단 부수효과 — blocker↔blocked 사이 **일반 1:1 DM** 의 ringing/active direct 통화를 종료한다.
 * 통화 상태 전이는 SSOT `updateCommunityMessengerCallSession` 만 사용 (여기서 직접 status 를 쓰지 않음).
 * 차단 자체를 실패시키지 않는다 — 호출부는 결과만 로그.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listGeneralDirectRoomIdsForPair } from "@/lib/community-messenger/participant-block-hide";
import { updateCommunityMessengerCallSession } from "@/lib/community-messenger/service";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

type BlockCallTerminationAction = "cancel" | "reject" | "end";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseOrNull() {
  try {
    return getSupabaseServer();
  } catch {
    return tryCreateSupabaseServiceClient();
  }
}

/** blocker 역할 기준 종료 action — 발신 ringing → cancel, 수신 ringing → reject, active → end */
export function resolveBlockCallTerminationAction(input: {
  blockerUserId: string;
  initiatorUserId: string;
  recipientUserId: string | null;
  status: string;
}): BlockCallTerminationAction | null {
  const blocker = trimText(input.blockerUserId);
  const status = trimText(input.status);
  if (!blocker) return null;
  const isInitiator = trimText(input.initiatorUserId) === blocker;
  const isRecipient = trimText(input.recipientUserId) === blocker;
  if (!isInitiator && !isRecipient) return null;
  if (status === "active") return "end";
  if (status === "ringing") return isInitiator ? "cancel" : "reject";
  return null;
}

export async function terminateDirectCallsOnBlock(input: {
  blockerUserId: string;
  blockedUserId: string;
}): Promise<{ terminatedSessionIds: string[]; errors: string[] }> {
  const blocker = trimText(input.blockerUserId);
  const blocked = trimText(input.blockedUserId);
  const out = { terminatedSessionIds: [] as string[], errors: [] as string[] };
  if (!blocker || !blocked || blocker === blocked) return out;

  const sb = getSupabaseOrNull();
  if (!sb) return out;

  const roomIds = await listGeneralDirectRoomIdsForPair(blocker, blocked);
  if (!roomIds.length) return out;

  const { data, error } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select("id, room_id, initiator_user_id, recipient_user_id, status")
    .eq("session_mode", "direct")
    .in("status", ["ringing", "active"])
    .in("room_id", roomIds)
    .or(
      `and(initiator_user_id.eq.${blocker},recipient_user_id.eq.${blocked}),and(initiator_user_id.eq.${blocked},recipient_user_id.eq.${blocker})`
    );
  if (error) {
    out.errors.push(String(error.message ?? "call_session_lookup_failed"));
    return out;
  }

  for (const row of (data ?? []) as Array<{
    id?: string;
    initiator_user_id?: string | null;
    recipient_user_id?: string | null;
    status?: string | null;
  }>) {
    const sessionId = trimText(row.id);
    if (!sessionId) continue;
    const action = resolveBlockCallTerminationAction({
      blockerUserId: blocker,
      initiatorUserId: trimText(row.initiator_user_id),
      recipientUserId: trimText(row.recipient_user_id) || null,
      status: trimText(row.status),
    });
    if (!action) continue;
    const result = await updateCommunityMessengerCallSession({ userId: blocker, sessionId, action });
    if (result.ok) out.terminatedSessionIds.push(sessionId);
    else out.errors.push(`${sessionId}:${result.error ?? "call_terminate_failed"}`);
  }
  return out;
}

/**
 * 모든 차단 진입점(메신저 relations/block · community/block-relations · 거래 chat/rooms/[roomId]/block)의
 * 공통 차단 부수효과 — 통화 종료. 예외·부분 실패는 로그만 남기고 차단 결과에 영향을 주지 않는다.
 */
export async function terminateDirectCallsOnBlockBestEffort(input: {
  blockerUserId: string;
  blockedUserId: string;
  logTag: string;
}): Promise<void> {
  try {
    const calls = await terminateDirectCallsOnBlock({
      blockerUserId: input.blockerUserId,
      blockedUserId: input.blockedUserId,
    });
    if (calls.errors.length) {
      console.warn(`[${input.logTag}] call termination on block partial`, {
        blockerUserId: input.blockerUserId,
        blockedUserId: input.blockedUserId,
        errors: calls.errors,
      });
    }
  } catch (error) {
    console.warn(`[${input.logTag}] call termination on block failed`, {
      blockerUserId: input.blockerUserId,
      blockedUserId: input.blockedUserId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
