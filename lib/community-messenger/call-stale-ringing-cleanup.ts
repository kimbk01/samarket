/**
 * DB에 남은 만료 `ringing` direct 세션이 수신 목록·busy·live 판정을 막는 것을 방지한다.
 * (발신 종료 PATCH 실패·앱 강종 등으로 zombie ringing 이 남을 때 연속 발신·수신 불가)
 */
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import type { MessengerCallAdminPolicy } from "@/lib/community-messenger/messenger-call-admin-policy";
import { clampIncomingRingTimeoutSeconds } from "@/lib/community-messenger/messenger-call-ring-timeout";

/** 링 타임아웃 직후 네트워크·PATCH 지연 여유 */
export const STALE_RINGING_GRACE_MS = 15_000;

export type StaleRingingSessionRow = {
  id: string;
  status: string;
  started_at: string | null;
  initiator_user_id: string | null;
  recipient_user_id: string | null;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isDirectRingingSessionExpired(
  startedAt: string | null | undefined,
  policy: MessengerCallAdminPolicy,
  nowMs = Date.now()
): boolean {
  const startMs = new Date(trimText(startedAt) || "").getTime();
  if (!Number.isFinite(startMs)) return false;
  const timeoutMs = clampIncomingRingTimeoutSeconds(policy.incoming_ring_timeout_seconds) * 1000;
  return nowMs > startMs + timeoutMs + STALE_RINGING_GRACE_MS;
}

export function isStaleRingingRow(
  row: Pick<StaleRingingSessionRow, "status" | "started_at">,
  policy: MessengerCallAdminPolicy,
  nowMs = Date.now()
): boolean {
  return trimText(row.status) === "ringing" && isDirectRingingSessionExpired(row.started_at, policy, nowMs);
}

async function terminalOneStaleRingingSession(
  actorUserId: string,
  row: StaleRingingSessionRow
): Promise<boolean> {
  const sid = trimText(row.id);
  const uid = trimText(actorUserId);
  if (!sid || !uid) return false;
  const { updateCommunityMessengerCallSession } = await import("@/lib/community-messenger/service");
  const action = messengerUserIdsEqual(row.initiator_user_id, uid) ? "cancel" : "missed";
  const result = await updateCommunityMessengerCallSession({
    userId: uid,
    sessionId: sid,
    action,
    clientEndedReason: "stale_ringing_expired",
  }).catch(() => ({ ok: false as const }));
  return result.ok === true;
}

/** viewer 관련 ringing direct 중 링 타임아웃 지난 세션을 terminal 처리 */
export async function terminalStaleRingingDirectSessionsForUser(
  sb: unknown,
  userId: string,
  policy: MessengerCallAdminPolicy
): Promise<number> {
  const uid = trimText(userId);
  if (!uid) return 0;
  const { data, error } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select("id, status, started_at, initiator_user_id, recipient_user_id")
    .eq("session_mode", "direct")
    .eq("status", "ringing")
    .or(`initiator_user_id.eq.${uid},recipient_user_id.eq.${uid}`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return 0;
  const rows = ((data ?? []) as StaleRingingSessionRow[]).filter((row) => isStaleRingingRow(row, policy));
  let closed = 0;
  for (const row of rows) {
    if (await terminalOneStaleRingingSession(uid, row)) closed += 1;
  }
  return closed;
}
