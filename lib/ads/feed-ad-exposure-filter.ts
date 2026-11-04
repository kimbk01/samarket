/**
 * DS-3 · DS-4 (2026-11-04 · 계약 변경 C-1): 피드 배너 노출 단계 목적지 확인.
 *
 * - 목적지 없음(「없음」)·형식이 깨진 목적지 → 노출하지 않는다 (누르면 반응 없는 배너 금지).
 * - 대상 확인: 삭제·숨김 거래 글 / 삭제·숨김 커뮤니티 글 / 비공개·미승인 매장 / 끝난·비공개 이벤트 → 노출하지 않는다.
 *   대상 조회는 팝업과 같은 함수(`popup-event-destination-availability.ts`)를 그대로 쓴다(그 파일은 고치지 않음).
 * - 조회 오류 → 그 종류는 열 수 없음(fail-closed, 팝업과 같음).
 * - 내부 화면 경로·외부 https 는 형식 검사(`feedAdDestinationRef`)만 한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPopupEntityDestinationLookups,
  loadPopupEventDestinationLookups,
  popupEntityCtaKey,
} from "@/lib/platform-popup/popup-event-destination-availability";
import { feedAdDestinationRef } from "@/lib/ads/feed-ad-destination";
import type { FeedAdCampaignView, FeedAdCreativeSlide } from "@/lib/ads/feed-ad-placement";

type Lookup = { exists: boolean; visible: boolean; expired?: boolean };

/** 슬라이드 목적지(없으면 캠페인 목적지) — 화면 `FeedAdBannerCarousel` 과 같은 규칙 */
export function feedAdEffectiveDestination(
  c: Pick<FeedAdCampaignView, "destinationType" | "destinationId" | "destinationUrl">,
  s?: Pick<FeedAdCreativeSlide, "destinationType" | "destinationId" | "destinationUrl"> | null
): { destinationType: string; destinationId: string; destinationUrl: string } {
  return {
    destinationType: String(s?.destinationType ?? c.destinationType ?? ""),
    destinationId: String(s?.destinationId || c.destinationId || ""),
    destinationUrl: String(s?.destinationUrl || c.destinationUrl || ""),
  };
}

/** 노출 전 대상 확인에 쓰는 키: 엔티티(`kind:target`) 또는 이벤트(`event:id`) · 경로·외부는 null */
export function feedAdDestinationCheckKey(d: {
  destinationType: string;
  destinationId: string;
  destinationUrl: string;
}): { kind: "entity"; key: string } | { kind: "event"; eventId: string } | { kind: "none" } | { kind: "plain" } {
  const ref = feedAdDestinationRef(d);
  if (!ref) return { kind: "none" };
  const type = d.destinationType.trim();
  const id = d.destinationId.trim();
  if ((type === "trade_listing" || type === "community_post" || type === "store") && id) {
    return { kind: "entity", key: popupEntityCtaKey(type, id) };
  }
  if (ref.kind === "event") return { kind: "event", eventId: ref.eventId };
  return { kind: "plain" };
}

function lookupOpen(l: Lookup | undefined): boolean {
  return Boolean(l && l.exists && l.visible && !l.expired);
}

/**
 * 노출 가능한 슬라이드만 남긴다. 남은 슬라이드가 없으면 캠페인을 뺀다.
 * 조회는 종류별 1번씩(글·커뮤니티 글·매장 묶음 1회 + 이벤트 1회).
 */
export async function filterFeedAdCampaignsByDestination<T extends FeedAdCampaignView>(
  sb: SupabaseClient,
  campaigns: readonly T[],
  nowMs: number = Date.now()
): Promise<T[]> {
  const entityKeys: string[] = [];
  const eventIds: string[] = [];
  const checks = campaigns.map((c) =>
    c.slides.map((s) => {
      const k = feedAdDestinationCheckKey(feedAdEffectiveDestination(c, s));
      if (k.kind === "entity") entityKeys.push(k.key);
      if (k.kind === "event") eventIds.push(k.eventId);
      return k;
    })
  );
  const [entity, events] = await Promise.all([
    entityKeys.length ? loadPopupEntityDestinationLookups(sb, entityKeys) : Promise.resolve(new Map<string, Lookup>()),
    eventIds.length ? loadPopupEventDestinationLookups(sb, eventIds, nowMs) : Promise.resolve(new Map<string, Lookup>()),
  ]);
  const out: T[] = [];
  campaigns.forEach((c, ci) => {
    const slides = c.slides.filter((_, si) => {
      const k = checks[ci]![si]!;
      if (k.kind === "none") return false;
      if (k.kind === "plain") return true;
      if (k.kind === "entity") return lookupOpen(entity.get(k.key));
      return lookupOpen(events.get(k.eventId));
    });
    if (slides.length > 0) out.push({ ...c, slides });
  });
  return out;
}
