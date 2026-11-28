/**
 * 관심이웃(`user_relationships` neighbor_follow) 단일 규칙 — 설계 `docs/audit/interest-neighbor-build-design-2026-11-28.md`.
 * 레거시(당근 「모아보기」 FAQ 102)와 같은 구조: 상태 지정 추가·해제 · 최대 100명 · 알림 없음 · 상대에게 알리지 않음.
 */

/** 한 회원이 맺을 수 있는 관심이웃 최대 수 (Owner 「시안대로 결정」 2026-11-28 = 레거시 100) */
export const NEIGHBOR_FOLLOW_LIMIT = 100;

/** 관심이웃 화면(내정보 › 라운지 › 관심이웃) 경로 — 옛 「모아보는 사용자」 주소도 모두 여기로 */
export const NEIGHBOR_FOLLOW_MYPAGE_HREF = "/mypage/section/community/community-friends";

/**
 * 관심이웃 관리 화면 — 자기 경로를 가진 내정보 항목(시안 ③ 제목 「관심이웃 관리」·뒤로 = 관심이웃).
 * 내정보 하위 화면 제목·뒤로는 경로로 정해진다(`mypage-ia` L2 표 · `MySubpageHeader`) — 같은 경로에 주소 값(`?manage=1`)을 붙이던
 * 첫 구현은 제목이 「관심이웃」으로 남았다(실기 2026-11-28 13:03 PHT).
 */
export const NEIGHBOR_FOLLOW_MANAGE_HREF = "/mypage/section/community/community-friends-manage";

/**
 * 내정보 관심이웃 사람 목록 기기 캐시 키 접두 (`lib/mypage/use-mypage-cursor-list.ts` 공용 캐시) — 뒤에 회원 id.
 * 보기↔관리 왕복마다 다시 읽던 것을 재사용, 추가·해제·차단 때 이 접두로 지운다(감사 B1 · 전체 수정 설계 v2 §5-4).
 */
export const NEIGHBOR_FOLLOW_PEOPLE_CACHE_PREFIX = "me:relations:neighbor:list";
