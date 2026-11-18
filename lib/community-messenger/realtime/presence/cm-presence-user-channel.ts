/**
 * D1 2단계 — 사용자별 접속 상태 **비공개** 토픽 (클라·서버 공통, `use client` 없음).
 *
 * - 발행: 서버(서비스 롤)만, 접속 상태가 **바뀔 때만**(앞화면 진입·백그라운드·세션 종료·유휴에서 복귀).
 * - 수신: 본인 또는 그 사용자와 **같은 방에 있는 사람**(`internal.cm_realtime_can_read_topic` 의 `cm-presence-user:%`).
 * - 구독: 화면에 실시간으로 보여 줄 상대만(1:1 방 머리글). 전역 1채널(`community-messenger:presence`, 접속자 N² 전파)을 대체.
 *
 * 근거: docs/audit/supabase-request-surge-2026-11-18/d1-presence-push-structure-analysis-2026-11-19.md
 */

export const CM_PRESENCE_USER_BROADCAST_EVENT = "presence";

export function communityMessengerPresenceUserChannelName(userId: string): string {
  return `cm-presence-user:${String(userId ?? "").trim().toLowerCase()}`;
}

export type CmPresenceUserBroadcastPayload = {
  v: 1;
  userId: string;
  state: "online" | "offline";
  lastSeenAt: string | null;
  at: string;
};

export function parseCmPresenceUserBroadcastPayload(raw: unknown): CmPresenceUserBroadcastPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const userId = typeof p.userId === "string" ? p.userId.trim() : "";
  const state = p.state === "online" || p.state === "offline" ? p.state : null;
  const at = typeof p.at === "string" ? p.at.trim() : "";
  if (!userId || !state || !at) return null;
  const lastSeenAt = typeof p.lastSeenAt === "string" && p.lastSeenAt.trim() ? p.lastSeenAt.trim() : null;
  return { v: 1, userId, state, lastSeenAt, at };
}
