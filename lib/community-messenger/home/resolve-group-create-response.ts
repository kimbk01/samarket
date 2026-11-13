import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/**
 * 그룹 만들기(`POST /api/community-messenger/groups/create`) 응답 → 화면 처리 1개로 판정.
 * 비공개·오픈 그룹 만들기 두 곳이 같이 쓴다.
 *
 * - `insert_and_open`: 방 요약이 왔다 → 목록에 바로 넣고 그 방으로 이동 (지금까지와 같음)
 * - `reload_and_open`: 방은 만들어졌는데 요약만 없다(서버 일부 성공) → 서버 목록을 다시 받고 그 방으로 이동.
 *   오류로 보여 주면 다시 눌러 같은 방이 또 생긴다 (D15 2026-11-13). 오픈 그룹 참여 경로와 같은 순서.
 * - `error`: 그 밖 — 호출부가 인증 차단·오류 문구를 처리
 */
export type GroupCreateResponseAction =
  | { kind: "insert_and_open"; roomId: string; summary: CommunityMessengerRoomSummary }
  | { kind: "reload_and_open"; roomId: string }
  | { kind: "error" };

export function resolveGroupCreateResponse(
  httpOk: boolean,
  json: { ok?: boolean; roomId?: string; room?: CommunityMessengerRoomSummary | null }
): GroupCreateResponseAction {
  const roomId = typeof json.roomId === "string" ? json.roomId.trim() : "";
  if (!httpOk || json.ok !== true || !roomId) return { kind: "error" };
  if (json.room) return { kind: "insert_and_open", roomId, summary: json.room };
  return { kind: "reload_and_open", roomId };
}
