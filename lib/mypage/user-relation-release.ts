/**
 * 차단·숨김 해제 API 주소 (최종 설계 S14). 관심이웃은 `POST /api/community/neighbor-relations` 상태 지정(관심이웃 설계 A).
 * 차단 해제는 서버가 `targetUserId` 를 요구한다(`app/api/me/relations/[type]/route.ts` DELETE) — 이전 화면은
 * `id` 만 보내 차단 해제가 400 으로 실패했다. 숨김은 관계 `id`.
 */
export type UserRelationListType = "hidden" | "blocked";

export function buildUserRelationDeleteUrl(
  type: UserRelationListType,
  item: { id: string; targetId: string },
): string {
  const qs = new URLSearchParams();
  qs.set("id", item.id);
  if (type === "blocked") qs.set("targetUserId", item.targetId);
  return `/api/me/relations/${type}?${qs.toString()}`;
}
