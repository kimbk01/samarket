"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TransitionEvent,
} from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type {
  FeedAdCampaignView,
  FeedAdCreativeSlide,
  FeedAdPlacement,
} from "@/lib/ads/feed-ad-placement";
import { selectCampaignsForPlacement } from "@/lib/ads/feed-ad-placement";
import {
  FEED_AD_SLIDE_INTERVAL_MS,
  FEED_AD_SLIDE_TRANSITION_MS,
  feedAdBodyClass,
  feedAdChromeBarClass,
  feedAdFrameClass,
  feedAdHeadlineClass,
  feedAdListItemClass,
  feedAdMediaClass,
  feedAdMediaViewportClass,
  type FeedAdHostDensity,
} from "@/lib/ads/feed-ad-geometry";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { recordPromotionContentVisitClient } from "@/lib/platform-promotion-lifecycle/client-record-content-visit";
import { DestinationLink } from "@/components/destination/DestinationLink";
import { feedAdDestinationRef } from "@/lib/ads/feed-ad-destination";
import type { DestinationRef } from "@/lib/destination/destination-contract";
import { feedAdAdvertiserDisplayName } from "@/lib/ads/feed-ad-advertiser-name";
import {
  FEED_AD_IMPRESSION_DWELL_MS,
  FEED_AD_IMPRESSION_MIN_RATIO,
  feedAdCreativeIdOfSlide,
  sendFeedAdEvent,
} from "@/lib/ads/feed-ad-event-client";

/** EVT-05: stored destination → DestinationRef (null = NONE / invalid → no navigation). */
function resolveDestination(c: FeedAdCampaignView, slide?: FeedAdCreativeSlide): DestinationRef | null {
  return feedAdDestinationRef({
    destinationType: slide?.destinationType ?? c.destinationType,
    destinationId: slide?.destinationId || c.destinationId,
    destinationUrl: slide?.destinationUrl || c.destinationUrl,
  });
}

/** One slot item = one campaign's primary reachable creative. */
function primarySlide(c: FeedAdCampaignView): FeedAdCreativeSlide | null {
  return c.slides.find((s) => s.imageUrl.trim()) ?? null;
}

/**
 * In-feed Advertisement sector.
 *
 * Slot contract (community SSOT connect):
 * - Up to 3 **distinct campaigns** left→right (selectCampaignsForPlacement).
 * - Creative 1–3 on a single campaign ≠ multi-campaign slot items.
 * - Single campaign with multiple creatives keeps existing creative carousel.
 * Empty → null (no reserved height).
 */
export function FeedAdBannerCarousel({
  domain,
  placement,
  categoryId,
  topicSlug,
  slotOrdinal = 0,
  feedSessionId,
  surfaceKey,
  /** Feed-level eligible pool — when set, no per-slot HTTP (FIX-8). */
  campaignPool,
}: {
  domain: "trade" | "community";
  placement: string;
  categoryId?: string;
  topicSlug?: string;
  slotOrdinal?: number;
  feedSessionId?: string;
  surfaceKey?: string;
  campaignPool?: FeedAdCampaignView[] | null;
}) {
  const { t, safeT } = useI18n();
  const [fetchedCampaigns, setFetchedCampaigns] = useState<FeedAdCampaignView[]>([]);
  const density: FeedAdHostDensity = domain === "community" ? "community" : "trade";
  const usePool = Array.isArray(campaignPool);

  const selectedFromPool = useMemo(() => {
    if (!usePool) return null;
    return selectCampaignsForPlacement(campaignPool ?? [], {
      domain,
      placement: placement as FeedAdPlacement,
      categoryId,
      topicSlug,
      slotOrdinal: Math.max(0, Math.floor(slotOrdinal)),
      feedSessionId,
    });
  }, [
    usePool,
    campaignPool,
    domain,
    placement,
    categoryId,
    topicSlug,
    slotOrdinal,
    feedSessionId,
  ]);

  useEffect(() => {
    if (usePool) return;
    let cancelled = false;
    const qs = new URLSearchParams({
      domain,
      placement,
      slotOrdinal: String(Math.max(0, Math.floor(slotOrdinal))),
    });
    if (categoryId) qs.set("categoryId", categoryId);
    if (topicSlug) qs.set("topicSlug", topicSlug);
    if (feedSessionId) qs.set("feedSessionId", feedSessionId);
    if (surfaceKey) qs.set("surfaceKey", surfaceKey);
    const key = `feed-ad-active:${qs.toString()}`;
    void runSingleFlight(key, async () => {
      const r = await fetch(`/api/feed-ads/active?${qs.toString()}`, {
        credentials: "include",
      });
      return (await r.json()) as {
        campaign?: FeedAdCampaignView | null;
        campaigns?: FeedAdCampaignView[];
      };
    })
      .then((j) => {
        if (cancelled) return;
        const list =
          Array.isArray(j.campaigns) && j.campaigns.length > 0
            ? j.campaigns
            : j.campaign
              ? [j.campaign]
              : [];
        setFetchedCampaigns(list);
      })
      .catch(() => {
        if (!cancelled) setFetchedCampaigns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [usePool, domain, placement, categoryId, topicSlug, slotOrdinal, feedSessionId, surfaceKey]);

  const campaigns = usePool ? (selectedFromPool ?? []) : fetchedCampaigns;
  if (campaigns.length === 0) return null;

  /**
   * Multi-campaign slot: one primary slide per campaign (L→R).
   * Single campaign: keep creative-slide carousel when 2–3 creatives exist.
   */
  const multiCampaign = campaigns.length > 1;
  const slides: FeedAdCreativeSlide[] = (() => {
    if (multiCampaign) {
      const out: FeedAdCreativeSlide[] = [];
      for (const c of campaigns) {
        const s = primarySlide(c);
        if (!s) continue;
        out.push({
          ...s,
          id: `camp:${c.id}:${s.id}`,
          destinationType: s.destinationType ?? c.destinationType,
          destinationId: s.destinationId || c.destinationId,
          destinationUrl: s.destinationUrl || c.destinationUrl,
          headline: s.headline || feedAdAdvertiserDisplayName(c.name),
        });
      }
      return out;
    }
    return (campaigns[0]?.slides.filter((s) => s.imageUrl.trim()) ?? []).slice();
  })();

  if (slides.length === 0) return null;

  const leadCampaign = campaigns[0]!;
  const campaignBySlide: FeedAdCampaignView[] = multiCampaign
    ? campaigns.filter((c) => primarySlide(c) != null).slice(0, slides.length)
    : slides.map(() => leadCampaign);

  return (
    <FeedAdBannerCarouselView
      campaign={leadCampaign}
      campaigns={campaignBySlide}
      slides={slides}
      density={density}
      placement={placement}
      slotOrdinal={Math.max(0, Math.floor(slotOrdinal))}
      feedSessionId={feedSessionId}
      adLabel={safeT("ui_home_feed_ad_label", { fallbackKo: "광고", fallbackEn: "Ad" })}
      altFallback={t("ui_home_feed_ad_label")}
    />
  );
}

function FeedAdBannerCarouselView({
  campaign,
  campaigns,
  slides,
  density,
  placement,
  slotOrdinal,
  feedSessionId,
  adLabel,
  altFallback,
}: {
  campaign: FeedAdCampaignView;
  campaigns: FeedAdCampaignView[];
  slides: FeedAdCreativeSlide[];
  density: FeedAdHostDensity;
  placement: string;
  slotOrdinal: number;
  feedSessionId?: string;
  adLabel: string;
  altFallback: string;
}) {
  const { t } = useI18n();
  const multi = slides.length > 1;
  const [trackIndex, setTrackIndex] = useState(0);
  const [transitionOn, setTransitionOn] = useState(true);
  const [inView, setInView] = useState(true);
  /** O-4 노출 기준 — 화면에 50% 이상 */
  const [halfVisible, setHalfVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const rootRef = useRef<HTMLLIElement>(null);
  const loopingRef = useRef(false);

  const logicalIndex = multi
    ? trackIndex % slides.length
    : Math.min(trackIndex, slides.length - 1);
  const current = slides[logicalIndex]!;
  const currentCampaign = campaigns[logicalIndex] ?? campaign;
  /** 재감사 S-1 (F-1): 내부 코드 이름(회원 신청·이벤트 접두어)은 고객에게 보이지 않게 */
  const advertiserName = feedAdAdvertiserDisplayName(currentCampaign.name);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setHalfVisible(Boolean(entry && entry.intersectionRatio >= FEED_AD_IMPRESSION_MIN_RATIO)),
      { threshold: [0, FEED_AD_IMPRESSION_MIN_RATIO] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /** Owner 결정 O-4: 지금 보이는 슬라이드가 50% 이상 · 1초 이어지면 노출 1회 (서버가 1시간 단위로 중복 제거) */
  const currentCampaignId = currentCampaign.id;
  const currentCreativeId = feedAdCreativeIdOfSlide(current.id, currentCampaignId);
  useEffect(() => {
    if (!halfVisible || !pageVisible) return;
    const id = window.setTimeout(() => {
      sendFeedAdEvent({
        eventType: "impression",
        campaignId: currentCampaignId,
        creativeId: currentCreativeId,
        placement,
        feedSessionId,
        slotOrdinal,
      });
    }, FEED_AD_IMPRESSION_DWELL_MS);
    return () => window.clearTimeout(id);
  }, [halfVisible, pageVisible, currentCampaignId, currentCreativeId, placement, feedSessionId, slotOrdinal]);

  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const goToLogical = useCallback(
    (i: number) => {
      if (!multi) return;
      loopingRef.current = false;
      setTransitionOn(!reduceMotion);
      setTrackIndex(((i % slides.length) + slides.length) % slides.length);
    },
    [multi, reduceMotion, slides.length]
  );

  const advance = useCallback(() => {
    if (!multi) return;
    setTransitionOn(!reduceMotion);
    setTrackIndex((prev) => {
      if (reduceMotion) return (prev + 1) % slides.length;
      if (prev >= slides.length) return slides.length;
      return prev + 1;
    });
  }, [multi, reduceMotion, slides.length]);

  useEffect(() => {
    if (!multi || !inView || !pageVisible) return;
    const id = window.setInterval(advance, FEED_AD_SLIDE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [advance, inView, multi, pageVisible]);

  const onTrackTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.propertyName !== "transform") return;
      if (!multi || reduceMotion) return;
      if (trackIndex < slides.length) return;
      loopingRef.current = true;
      setTransitionOn(false);
      setTrackIndex(0);
    },
    [multi, reduceMotion, slides.length, trackIndex]
  );

  useLayoutEffect(() => {
    if (!loopingRef.current) return;
    loopingRef.current = false;
    const id = window.requestAnimationFrame(() => setTransitionOn(true));
    return () => window.cancelAnimationFrame(id);
  }, [trackIndex]);

  const translatePct = multi ? -(trackIndex * 100) : 0;
  const trackSlides = multi ? [...slides, slides[0]!] : slides;
  const trackCampaigns = multi ? [...campaigns, campaigns[0]!] : campaigns;

  return (
    <li
      ref={rootRef}
      className={feedAdListItemClass(density)}
      data-feed-ad-slot=""
      data-feed-ad-density={density}
      data-feed-ad-slides={String(slides.length)}
      data-feed-ad-campaigns={String(new Set(campaigns.map((c) => c.id)).size)}
    >
      <div className={feedAdFrameClass(density)}>
        <div className={feedAdChromeBarClass(density)}>
          {density === "trade" ? (
            /** v5 D4 거래 광고 머리: 광고주(캠페인 이름) 동그라미·이름 14px/700 · 「광고」 12px */
            <span className="flex min-w-0 flex-1 items-center gap-2" data-feed-ad-advertiser="">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sam-primary-soft text-[14px] font-bold text-sam-primary"
              >
                {(advertiserName[0] ?? adLabel[0] ?? "").toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-bold leading-[18px] text-sam-fg">
                  {advertiserName || adLabel}
                </span>
                <span className="text-[12px] leading-4 text-sam-muted">{adLabel}</span>
              </span>
            </span>
          ) : (
            <span className="rounded bg-sam-app px-1.5 py-0.5 sam-text-helper font-medium text-sam-muted">
              {adLabel}
            </span>
          )}
          {multi ? (
            <div className="-my-[9px] flex" role="tablist" aria-label={adLabel}>
              {slides.map((_, i) => (
                <button
                  key={slides[i]!.id || i}
                  type="button"
                  role="tab"
                  aria-selected={i === logicalIndex}
                  aria-label={t("ui_delivery_banner_slide_aria", { n: i + 1 })}
                  /**
                   * 광고 감사 B-5 → 재감사 E-2: 누르는 영역 = 버튼 자체 24×24(서로 겹치지 않음), 점은 안의 6px.
                   * (이전: 6px 버튼 + 가상 요소 24px 를 10px 간격에 둬 옆 점이 눌렸다.) 줄 높이는 -my 로 그대로.
                   */
                  className="flex h-6 w-6 items-center justify-center"
                  onClick={() => goToLogical(i)}
                  data-feed-ad-dot={i}
                >
                  <span
                    aria-hidden
                    className={`block h-1.5 w-1.5 rounded-full ${i === logicalIndex ? "bg-sam-primary" : "bg-sam-border"}`}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className={feedAdBodyClass(density)}>
          <div
            className={feedAdMediaViewportClass(density)}
            data-feed-ad-media=""
          >
            <div
              className="flex h-full w-full"
              data-feed-ad-track=""
              style={{
                transform: `translate3d(${translatePct}%, 0, 0)`,
                transition: transitionOn
                  ? `transform ${FEED_AD_SLIDE_TRANSITION_MS}ms ease-out`
                  : "none",
                willChange: "transform",
              }}
              onTransitionEnd={onTrackTransitionEnd}
            >
              {trackSlides.map((s, i) => {
                const camp = trackCampaigns[i] ?? currentCampaign;
                const destination = resolveDestination(camp, s);
                const isClone = multi && i === trackSlides.length - 1 && i > 0;
                return (
                  <DestinationLink
                    key={isClone ? `${s.id}-loop` : s.id || `slide-${i}`}
                    destination={destination}
                    className="relative block h-full min-w-0 shrink-0 grow-0 basis-full"
                    style={{ flex: "0 0 100%" }}
                    tabIndex={
                      i === trackIndex || (isClone && trackIndex === slides.length)
                        ? 0
                        : -1
                    }
                    onNavigate={(ref) => {
                      // O-4 클릭 1회 — 이동 전에 보낸다 (keepalive)
                      sendFeedAdEvent({
                        eventType: "click",
                        campaignId: camp.id,
                        creativeId: feedAdCreativeIdOfSlide(s.id, camp.id),
                        placement,
                        feedSessionId,
                        slotOrdinal,
                      });
                      // BANNER TAP only — impression alone does not coordinate.
                      if (ref.kind === "event") {
                        recordPromotionContentVisitClient({
                          hrefOrEventId: ref.eventId,
                          sourceChannel: "BANNER",
                        });
                      }
                    }}
                  >
                    <SamarketThumbnail
                      src={s.imageUrl}
                      fill
                      roundedClassName="rounded-ui-rect"
                      className="!h-full !w-full bg-sam-app"
                      alt={s.altText || feedAdAdvertiserDisplayName(camp.name) || altFallback}
                    />
                  </DestinationLink>
                );
              })}
            </div>
          </div>
          {current.headline?.trim() ? (
            <p className={feedAdHeadlineClass(density)}>{current.headline.trim()}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Admin / docs Preview — same frame + media height tokens as consumer (no fetch). */
export function FeedAdFramePreview({
  density,
  imageUrl,
  headline,
  alt,
}: {
  density: FeedAdHostDensity;
  imageUrl: string;
  headline?: string;
  alt?: string;
}) {
  const { safeT } = useI18n();
  if (!imageUrl.trim()) return null;
  return (
    <div className={feedAdFrameClass(density)} data-feed-ad-preview="" data-feed-ad-density={density}>
      <div className={feedAdChromeBarClass(density)}>
        <span className="rounded bg-sam-app px-1.5 py-0.5 sam-text-helper font-medium text-sam-muted">
          {safeT("ui_home_feed_ad_label", { fallbackKo: "광고", fallbackEn: "Ad" })}
        </span>
      </div>
      <div className={feedAdBodyClass(density)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- admin local/blob preview */}
        <img
          src={imageUrl}
          alt={alt || ""}
          className={`${feedAdMediaClass(density)} rounded-ui-rect`}
        />
        {headline?.trim() ? (
          <p className={feedAdHeadlineClass(density)}>{headline.trim()}</p>
        ) : null}
      </div>
    </div>
  );
}
