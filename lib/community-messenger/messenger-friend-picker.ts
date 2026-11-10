import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

/**
 * 친구 고르기 (채팅 시안 4판 「6. 그룹 대화」) — 화면 밖 계산만.
 * 목록 = 친구 탭과 같은 친구 목록 · 나 자신 제외 · 찾기는 친구 이름(대소문자 무시).
 */
export function filterMessengerPickerFriends(
  friends: readonly CommunityMessengerProfileLite[],
  input: { viewerUserId: string | null | undefined; query: string }
): CommunityMessengerProfileLite[] {
  const viewer = input.viewerUserId?.trim() ?? "";
  const q = input.query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: CommunityMessengerProfileLite[] = [];
  for (const friend of friends) {
    if (!friend?.id || seen.has(friend.id)) continue;
    if (viewer && friend.id === viewer) continue;
    if (friend.blocked) continue;
    if (q && !(friend.label ?? "").toLowerCase().includes(q)) continue;
    seen.add(friend.id);
    out.push(friend);
  }
  return out;
}

/** 줄을 누르면 고르기/빼기 — 고른 순서를 지킨다 (고른 친구 줄 순서 = 고른 순서) */
export function toggleMessengerPickerSelection(selectedIds: readonly string[], id: string): string[] {
  return selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
}

/**
 * 「n명으로 그룹 만들기」를 누를 수 있는가 — 비공개 그룹 만들기 서버 규칙(`createGroupRoom`: 나 말고 1명 이상)과 같다.
 * 그룹 인원 상한 상수는 비공개 그룹에 없다(서버에도 없음) — 머리글은 고른 수만 보인다.
 */
export function canCreateMessengerPickerGroup(selectedCount: number): boolean {
  return selectedCount >= 1;
}
