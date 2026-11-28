/**
 * 관심이웃(`user_relationships` neighbor_follow) 단일 규칙 — 설계 `docs/audit/interest-neighbor-build-design-2026-11-28.md`.
 * 레거시(당근 「모아보기」 FAQ 102)와 같은 구조: 상태 지정 추가·해제 · 최대 100명 · 알림 없음 · 상대에게 알리지 않음.
 */

/** 한 회원이 맺을 수 있는 관심이웃 최대 수 (Owner 「시안대로 결정」 2026-11-28 = 레거시 100) */
export const NEIGHBOR_FOLLOW_LIMIT = 100;

/** 관심이웃 화면(내정보 › 라운지 › 관심이웃) 경로 — 옛 「모아보는 사용자」 주소도 모두 여기로 */
export const NEIGHBOR_FOLLOW_MYPAGE_HREF = "/mypage/section/community/community-friends";

/** `POST /api/community/neighbor-relations` 거절 코드 */
export type NeighborFollowErrorCode =
  | "bad_target"
  | "following_required"
  | "blocked_target"
  | "target_unavailable"
  | "neighbor_follow_limit"
  | "save_failed"
  | "server_config";

export type NeighborFollowPostResponse =
  | { ok: true; following: boolean }
  | { ok: false; error: NeighborFollowErrorCode | string };
