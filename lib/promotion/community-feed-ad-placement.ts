/**
 * 커뮤니티 피드 상위노출 자리 계산 (클라이언트 안전 — 서버 전용 모듈 import 금지).
 * - 노출 순서 (§F-5-2): 공지·관리자 고정 > 유료 상위노출(위쪽 3개) > 일반
 * - Owner 결정 O-2: 위쪽에는 최근 결제 순 3개만. 나머지 광고 중인 글은 일반 목록 제자리에 「포인트 노출」 표시.
 * - 광고 ② PB-21 (2026-11-04): `topAds` = 광고 중인 글 **전체**(id) — 위쪽 3개만 카드 값(`feedPost`)이 있다.
 * - 광고 ② PB-22 (2026-11-04): 운영 고정 글도 광고 중이면 표시(`activeAdPostIds` 로 판정).
 */
import { PROMOTED_TOP_PINS_MAX } from "@/lib/promotion/promoted-top-pins";

type AdLike<P> = { postId?: string | null; feedPost: P | null };
type PostLike = { id: string | number; is_notice?: boolean; is_pinned?: boolean };

export function planCommunityFeedAdPlacement<P, A extends AdLike<P>, T extends PostLike>(input: {
  posts: T[];
  topAds: A[];
  topMax?: number;
}): {
  operatorTopPosts: T[];
  topAdsBelowOperator: A[];
  activeAdPostIds: Set<string>;
  postsForList: T[];
} {
  const topMax = input.topMax ?? PROMOTED_TOP_PINS_MAX;
  const operatorTopPosts = input.posts.filter((p) => p.is_notice || p.is_pinned);
  const operatorIds = new Set(operatorTopPosts.map((p) => String(p.id)));
  // 보는 회원에게 보일 수 있는 글(카드 값이 온 글)만 위쪽 자리를 차지한다 — 차단·숨김 글이 자리를 비우지 않게
  const topAdsBelowOperator = input.topAds
    .filter((ad) => ad.feedPost != null && !operatorIds.has(String(ad.postId ?? "").trim()))
    .slice(0, topMax);
  const pinnedAdPostIds = new Set(
    topAdsBelowOperator.map((ad) => String(ad.postId ?? "").trim()).filter(Boolean)
  );
  const activeAdPostIds = new Set(input.topAds.map((ad) => String(ad.postId ?? "").trim()).filter(Boolean));
  const normal =
    operatorTopPosts.length > 0 ? input.posts.filter((p) => !p.is_notice && !p.is_pinned) : input.posts;
  const postsForList =
    pinnedAdPostIds.size === 0 ? normal : normal.filter((p) => !pinnedAdPostIds.has(String(p.id)));
  return { operatorTopPosts, topAdsBelowOperator, activeAdPostIds, postsForList };
}

/** 광고 ② D-29 (2026-11-04): 검색어(해시태그 `tag` · 키워드 `q`)가 있으면 피드 배너를 끼우지 않는다 */
export function communityFeedBannerAllowedForSearch(input: {
  tag: string | null | undefined;
  q: string | null | undefined;
}): boolean {
  return !(input.tag ?? "").trim() && !(input.q ?? "").trim();
}
