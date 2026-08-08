"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
} from "@/lib/ads/feed-ad-placement";
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

/**
 * In-feed Advertisement sector (1 slot · up to 3 creatives).
 * Empty campaign → null (no reserved height / blank shell).
 * Geometry SSOT: `lib/ads/feed-ad-geometry.ts` — not a hero banner.
 *
 * Multi-slide: auto-advance right→left (index++) with seamless loop.
 * Width: host-aligned via fill + density height tokens (no fixed size={720}).
 */
export function FeedAdBannerCarousel({
  domain,
  placement,
  categoryId,
  topicSlug,
}: {
  domain: "trade" | "community";
  placement: string;
  categoryId?: string;
  topicSlug?: string;
}) {
  const { t, safeT } = useI18n();
  const [campaign, setCampaign] = useState<FeedAdCampaignView | null>(null);
  const density: FeedAdHostDensity = domain === "community" ? "community" : "trade";

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({
      domain,
      placement,
    });
    if (categoryId) qs.set("categoryId", categoryId);
    if (topicSlug) qs.set("topicSlug", topicSlug);
    const key = `feed-ad-active:${qs.toString()}`;
    // Parse JSON inside single-flight — shared Response.json() must not run twice
    // (React Strict Mode remount joins the same flight and would clear campaign).
    void runSingleFlight(key, async () => {
      const r = await fetch(`/api/feed-ads/active?${qs.toString()}`, {
        credentials: "include",
      });
      return (await r.json()) as { campaign?: FeedAdCampaignView | null };
    })
      .then((j) => {
        if (!cancelled) setCampaign(j.campaign ?? null);
      })
      .catch(() => {
        if (!cancelled) setCampaign(null);
      });
    return () => {
      cancelled = true;
    };
  }, [domain, placement, categoryId, topicSlug]);

  const slides = campaign?.slides.filter((s) => s.imageUrl.trim()) ?? [];
  if (!campaign || slides.length === 0) return null;

  return (
    <FeedAdBannerCarouselView
      campaign={campaign}
      slides={slides}
      density={density}
      adLabel={safeT("ui_home_feed_ad_label", { fallbackKo: "광고", fallbackEn: "Ad" })}
      altFallback={t("ui_home_feed_ad_label")}
    />
  );
}

function FeedAdBannerCarouselView({
  campaign,
  slides,
  density,
  adLabel,
  altFallback,
}: {
  campaign: FeedAdCampaignView;
  slides: FeedAdCreativeSlide[];
  density: FeedAdHostDensity;
  adLabel: string;
  altFallback: string;
}) {
  const multi = slides.length > 1;
  /** Track index: 0..n-1 real; when multi, n = clone of first for seamless loop. */
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
      // Move toward clone of first (index === slides.length) for seamless wrap.
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
      // Landed on clone of first → snap to real first without animation.
      loopingRef.current = true;
      setTransitionOn(false);
      setTrackIndex(0);
    },
    [multi, reduceMotion, slides.length, trackIndex]
  );

  useLayoutEffect(() => {
    if (!loopingRef.current) return;
    loopingRef.current = false;
    // Re-enable transition on next frame after snap-back.
    const id = window.requestAnimationFrame(() => setTransitionOn(true));
    return () => window.cancelAnimationFrame(id);
  }, [trackIndex]);

  /**
   * Track is `w-full` (= viewport width). Each slide is `flex: 0 0 100%` of that width.
   * `translateX(-N * 100%)` is % of the track box (= one viewport per step). R→L = index++.
   */
  const translatePct = multi ? -(trackIndex * 100) : 0;
  const trackSlides = multi ? [...slides, slides[0]!] : slides;

  return (
    <li
      ref={rootRef}
      className={feedAdListItemClass(density)}
      data-feed-ad-slot=""
      data-feed-ad-density={density}
      data-feed-ad-slides={String(slides.length)}
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
                const href = resolveHref(campaign, s);
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
                      className="!h-full !w-full"
                      alt={s.altText || campaign.name || altFallback}
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
