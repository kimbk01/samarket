import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

/**
 * C-2: 실시간·visibility 재조회는 첫 페이지만 받는다 — 이미 더 불러온 목록이면
 * 같은 id 는 갱신하고 새 id 는 위에 붙이며, 뒤쪽 행(과 커서)은 유지한다.
 */
export function mergeCallLogsFirstPage(
  prev: CommunityMessengerCallLog[],
  firstPage: CommunityMessengerCallLog[]
): CommunityMessengerCallLog[] {
  const pageIds = new Set(firstPage.map((c) => c.id));
  const rest = prev.filter((c) => !pageIds.has(c.id));
  return [...firstPage, ...rest];
}

/** seed 내용 식별 — 배열·행 참조가 아니라 id·상태·종료 시각·통화 시간 변경만 반영 (C-1) */
export function callLogsIdentityKey(calls: CommunityMessengerCallLog[]): string {
  if (calls.length === 0) return "";
  return calls.map((c) => `${c.id}:${c.status}:${c.endedAt ?? ""}:${c.durationSeconds ?? ""}`).join("|");
}
