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
import Link from "next/link";
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

function resolveHref(c: FeedAdCampaignView, slide?: FeedAdCreativeSlide): string {
  const type = slide?.destinationType ?? c.destinationType;
  const id = (slide?.destinationId || c.destinationId).trim();
  const url = (slide?.destinationUrl || c.destinationUrl).trim();
  if (type === "trade_listing" && id) return `/post/${encodeURIComponent(id)}`;
  if (type === "community_post" && id) return `/philife/post/${encodeURIComponent(id)}`;
  if (type === "store" && id) return `/stores/${encodeURIComponent(id)}`;
  if (type === "external_url" && url) return url;
  if (url.startsWith("/")) return url;
  return url || "#";
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
          headline: s.headline || c.name,
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
  adLabel,
  altFallback,
}: {
  campaign: FeedAdCampaignView;
  campaigns: FeedAdCampaignView[];
  slides: FeedAdCreativeSlide[];
  density: FeedAdHostDensity;
  adLabel: string;
  altFallback: string;
}) {
  const multi = slides.length > 1;
  const [trackIndex, setTrackIndex] = useState(0);
  const [transitionOn, setTransitionOn] = useState(true);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const rootRef = useRef<HTMLLIElement>(null);
  const loopingRef = useRef(false);

  const logicalIndex = multi
    ? trackIndex % slides.length
    : Math.min(trackIndex, slides.length - 1);
  const current = slides[logicalIndex]!;
  const currentCampaign = campaigns[logicalIndex] ?? campaign;

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
          <span className="rounded bg-sam-app px-1.5 py-0.5 sam-text-helper font-medium text-sam-muted">
            {adLabel}
          </span>
          {multi ? (
            <div className="flex gap-1" role="tablist" aria-label={adLabel}>
              {slides.map((_, i) => (
                <button
                  key={slides[i]!.id || i}
                  type="button"
                  role="tab"
                  aria-selected={i === logicalIndex}
                  aria-label={`slide ${i + 1}`}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i === logicalIndex ? "bg-sam-primary" : "bg-sam-border"
                  }`}
                  onClick={() => goToLogical(i)}
                />
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
                const href = resolveHref(camp, s);
                const external = href.startsWith("http");
                const isClone = multi && i === trackSlides.length - 1 && i > 0;
                return (
                  <Link
                    key={isClone ? `${s.id}-loop` : s.id || `slide-${i}`}
                    href={href === "#" ? "/" : href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="relative block h-full min-w-0 shrink-0 grow-0 basis-full"
                    style={{ flex: "0 0 100%" }}
                    tabIndex={
                      i === trackIndex || (isClone && trackIndex === slides.length)
                        ? 0
                        : -1
                    }
                    onClick={(e) => {
                      if (href === "#") e.preventDefault();
                    }}
                  >
                    <SamarketThumbnail
                      src={s.imageUrl}
                      fill
                      roundedClassName="rounded-ui-rect"
                      className="!h-full !w-full bg-sam-app"
                      alt={s.altText || camp.name || altFallback}
                    />
                  </Link>
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
