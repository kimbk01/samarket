/**
 * S-2 H (Owner 2026-11-02) — 참가 행 기록 하한 `cleared_at`(「나만 대화 삭제」·카카오 나가기 후 재참가).
 * 운영 부트스트랩 RPC `get_community_messenger_room_bootstrap_snapshot` 과 같은 규칙: `created_at > cleared_at` 만 보인다.
 * null = 전체 기록. 서버의 모든 메시지 읽기 경로가 이 두 함수만 쓴다.
 */

export function participantHistoryFloorIso(row: unknown): string | null {
  const v = (row as { cleared_at?: unknown } | null | undefined)?.cleared_at;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function isMessageVisibleUnderHistoryFloor(createdAt: string | null | undefined, floorIso: string | null): boolean {
  if (!floorIso) return true;
  const floor = Date.parse(floorIso);
  if (!Number.isFinite(floor)) return true;
  const at = Date.parse(typeof createdAt === "string" ? createdAt.trim() : "");
  return Number.isFinite(at) && at > floor;
}

/** 기기 쪽 같은 규칙 — 저장소·캐시·서버 응답을 합친 타임라인에서 하한 이하 메시지를 버린다. */
export function filterMessagesByHistoryFloor<T extends { createdAt?: string | null }>(
  messages: T[],
  floorIso: string | null | undefined
): T[] {
  const floor = typeof floorIso === "string" && floorIso.trim() ? floorIso.trim() : null;
  if (!floor) return messages;
  return messages.filter((m) => isMessageVisibleUnderHistoryFloor(m.createdAt ?? null, floor));
}
