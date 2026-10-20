/**
 * 관심·차단·숨김·이웃 해제 API 주소 (최종 설계 S14).
 * 차단 해제는 서버가 `targetUserId` 를 요구한다(`app/api/me/relations/[type]/route.ts` DELETE) — 이전 화면은
 * `id` 만 보내 차단 해제가 400 으로 실패했다. 관심·숨김·이웃은 관계 `id`.
 */
export type UserRelationListType = "favorite" | "hidden" | "blocked" | "neighbor";

export function buildUserRelationDeleteUrl(
  type: UserRelationListType,
  item: { id: string; targetId: string },
): string {
  const qs = new URLSearchParams();
  qs.set("id", item.id);
  if (type === "blocked") qs.set("targetUserId", item.targetId);
  return `/api/me/relations/${type}?${qs.toString()}`;
}

/** 해제 전 확인 시트가 필요한 목록 — 이웃(커뮤니티 공유 사용처)은 기존 즉시 해제 유지 */
export function userRelationReleaseNeedsConfirm(type: UserRelationListType): boolean {
  return type !== "neighbor";
}
