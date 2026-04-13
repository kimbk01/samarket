/**
 * 필라이프·동네 커뮤니티 글 — 단일 정의 (`public.community_posts`).
 *
 * **피드 노출 조건 (누적)**
 * 1. DB: `status` = {@link COMMUNITY_POST_FEED_STATUS_ACTIVE}
 * 2. 애플리케이션: `isCommunityPostPubliclyVisible` (레거시 `is_hidden` / `is_deleted` 등)
 * 3. 범위: 동네 한정 피드는 `location_id` 일치; 전역 피드(`globalFeed` / `allLocations`)는 지역 미필터
 * 4. 뷰어: 차단 작성자 제외; 「관심이웃만」이면 팔로 대상 + 본인만
 * 5. 주제 칩: `category` 쿼리는 어드민 `community_topics` 에 허용된 slug 만 유효
 *
 * 일반 작성은 `is_sample_data: false` 로 넣으며, 어드민·시드 플래그와 무관하게 위 규칙만 적용한다.
 */
export const COMMUNITY_POSTS_TABLE = "community_posts" as const;

/** 피드·공개 목록에 올라오는 글 상태 */
export const COMMUNITY_POST_FEED_STATUS_ACTIVE = "active" as const;
