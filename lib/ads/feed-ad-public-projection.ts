/**
 * PV-3 (S-3 · 2026-11-04): 피드 배너 **공개 응답 투영** — `/api/feed-ads/active` 가 보내는 모양은 이것 하나.
 *
 * 보내는 것: id · 위치(placement) · 광고주 표시 이름(서버에서 `feedAdCampaignAdvertiserName` 적용) · 목적지 · 소재(이미지·제목·목적지).
 * 보내지 않는 것: 기간(startAt/endAt) · 우선순위 · 출처(source) · 신청 id · 상태 · 원래 이름 · 노출/클릭 수.
 * 기간 판정은 서버가 한다(지금 노출 가능한 것만, 순서대로). 화면은 다시 판정하지 않고, 응답의 `validUntil`(다음 재조회 시각)만 본다.
 */
import { feedAdCampaignAdvertiserName } from "@/lib/ads/feed-ad-advertiser-name";
import type {
  FeedAdCampaignView,
  FeedAdDestinationType,
  FeedAdPlacement,
} from "@/lib/ads/feed-ad-placement";

export type FeedAdPublicSlide = {
  id: string;
  sortOrder: number;
  imageUrl: string;
  altText: string;
  headline: string;
  description: string;
  ctaLabel: string;
  destinationType: FeedAdDestinationType | null;
  destinationId: string;
  destinationUrl: string;
};

export type FeedAdPublicCampaign = {
  id: string;
  placement: FeedAdPlacement;
  /** 「광고」 옆 이름 — 빈 값이면 「광고」만 */
  advertiserName: string;
  destinationType: FeedAdDestinationType;
  destinationId: string;
  destinationUrl: string;
  slides: FeedAdPublicSlide[];
};

/** 공개 응답에 나오면 안 되는 키 (응답 시험 · PV-6 허용 목록과 같은 방향) */
export const FEED_AD_PUBLIC_FORBIDDEN_KEYS = [
  "name",
  "startAt",
  "endAt",
  "start_at",
  "end_at",
  "priority",
  "source",
  "requestId",
  "request_id",
  "status",
  "impressionCount",
  "clickCount",
  "memberNickname",
  "targetCategoryId",
  "targetTopicSlug",
] as const;

export function projectFeedAdPublicCampaign(c: FeedAdCampaignView): FeedAdPublicCampaign {
  return {
    id: c.id,
    placement: c.placement,
    advertiserName: feedAdCampaignAdvertiserName({
      name: c.name,
      source: c.source,
      memberNickname: c.memberNickname,
    }),
    destinationType: c.destinationType,
    destinationId: c.destinationId,
    destinationUrl: c.destinationUrl,
    slides: c.slides.map((s) => ({
      id: s.id,
      sortOrder: s.sortOrder,
      imageUrl: s.imageUrl,
      altText: s.altText,
      headline: s.headline,
      description: s.description,
      ctaLabel: s.ctaLabel,
      destinationType: s.destinationType,
      destinationId: s.destinationId,
      destinationUrl: s.destinationUrl,
    })),
  };
}

/**
 * 응답 캐시(15초)보다 길게 열린 화면도 기간 끝난 배너를 계속 보이지 않도록 — 가장 먼저 끝나는 시각(없으면 null).
 * FA-6: 아직 시작 전인 active 캠페인의 가장 빠른 시작 시각(`nextStartAt`)도 넣는다 — 시작하면 열린 화면이 다시 불러온다.
 */
export function feedAdPublicValidUntil(
  campaigns: ReadonlyArray<Pick<FeedAdCampaignView, "endAt">>,
  nowMs: number = Date.now(),
  nextStartAt: string | null = null
): string | null {
  let min = Number.POSITIVE_INFINITY;
  for (const c of campaigns) {
    const t = c.endAt ? Date.parse(c.endAt) : NaN;
    if (Number.isFinite(t) && t > nowMs && t < min) min = t;
  }
  const start = nextStartAt ? Date.parse(nextStartAt) : NaN;
  if (Number.isFinite(start) && start > nowMs && start < min) min = start;
  return Number.isFinite(min) ? new Date(min).toISOString() : null;
}

/**
 * PV-3 — 풀로 받는 화면(거래 홈·카테고리·커뮤니티)이 응답의 `validUntil`(다음 재조회 시각)에 다시 부르기까지의 지연.
 * 없거나 잘못된 값이면 null(재조회 안 함). 너무 잦은 재조회를 막으려고 최소 30초, 최대 6시간.
 */
export function feedAdPoolRefreshDelayMs(validUntil: string | null | undefined, nowMs: number = Date.now()): number | null {
  const until = validUntil ? Date.parse(validUntil) : NaN;
  if (!Number.isFinite(until)) return null;
  return Math.min(6 * 60 * 60 * 1000, Math.max(30_000, until - nowMs));
}
