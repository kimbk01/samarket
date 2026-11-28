/**
 * 모임을 볼 수 있는가 — 단일 정의 (R5 E4 · 설계 P15). 서버 조회(`loadMoimAccess`)와 알림 이동 위치(`moimNotifyLink`)가 같이 쓴다.
 * 서버 전용 모듈을 import 하지 않는다(화면에서도 쓸 수 있다).
 * - 삭제 모임: 아무도 못 본다
 * - 종료 모임: 열람 기간이 끝나지 않았고 활동 멤버였던 사람만
 * - 활동 모임(일반·추천 제외·경고·차단): 공개 페이지 또는 멤버 홈
 */
export type MoimViewState = { status: "active" | "closed" | "deleted"; retentionEndedAt: string | null };

export function moimViewable(s: MoimViewState, receiverIsActiveMember: boolean): boolean {
  if (s.status === "deleted") return false;
  if (s.status === "closed") return !s.retentionEndedAt && receiverIsActiveMember;
  return true;
}

/** RPC 반환값(`moim_status`·`retention_ended_at`)에서 상태를 읽는다. 키가 없으면(옛 DB) null — 부르는 쪽은 원래 위치를 쓴다 */
export function moimViewStateFromRpc(row: { moim_status?: unknown; retention_ended_at?: unknown } | null | undefined): MoimViewState | null {
  const status = row?.moim_status;
  if (status !== "active" && status !== "closed" && status !== "deleted") return null;
  const ret = row?.retention_ended_at;
  return { status, retentionEndedAt: typeof ret === "string" && ret ? ret : null };
}
