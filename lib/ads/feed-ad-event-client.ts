/**
 * Owner 결정 O-4 (2026-11-03) — 피드 배너 노출·클릭 기록 (클라이언트).
 * 노출 = 화면 50% 이상 1초 · 클릭 = 누름 (배달 배너와 같은 기준).
 * 중복 방지 키는 서버(`record_feed_ad_event`)가 만든다 — 여기 기억은 같은 요청을 다시 보내지 않으려는 것뿐이다.
 * 보내고 기다리지 않는다 (실패해도 화면에 영향 없음).
 */

export const FEED_AD_IMPRESSION_MIN_RATIO = 0.5;
export const FEED_AD_IMPRESSION_DWELL_MS = 1000;

export type FeedAdEventInput = {
  eventType: "impression" | "click";
  campaignId: string;
  creativeId: string | null;
  placement: string;
  feedSessionId?: string;
  slotOrdinal: number;
};

const sent = new Set<string>();

/** 슬라이드 id → 소재 id (여러 캠페인 자리는 `camp:<캠페인>:<소재>`) */
export function feedAdCreativeIdOfSlide(slideId: string, campaignId: string): string | null {
  const prefix = `camp:${campaignId}:`;
  const id = slideId.startsWith(prefix) ? slideId.slice(prefix.length) : slideId;
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function sendFeedAdEvent(input: FeedAdEventInput): void {
  if (typeof window === "undefined" || !input.campaignId) return;
  const hour = Math.floor(Date.now() / 3_600_000);
  const memo = [input.eventType, input.campaignId, input.creativeId ?? "-", input.feedSessionId ?? "-", input.slotOrdinal, hour].join("|");
  if (sent.has(memo)) return;
  sent.add(memo);
  void fetch("/api/feed-ads/events", {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => {
    sent.delete(memo);
  });
}
