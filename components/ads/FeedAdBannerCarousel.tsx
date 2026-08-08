"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";
import {
  feedAdBodyClass,
  feedAdChromeBarClass,
  feedAdFrameClass,
  feedAdHeadlineClass,
  feedAdListItemClass,
  feedAdMediaClass,
  type FeedAdHostDensity,
} from "@/lib/ads/feed-ad-geometry";
import { runSingleFlight } from "@/lib/http/run-single-flight";

function resolveHref(c: FeedAdCampaignView): string {
  const slide = c.slides[0];
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
  const [slide, setSlide] = useState(0);
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

  const current = slides[Math.min(slide, slides.length - 1)]!;
  const href = resolveHref(campaign);
  const external = href.startsWith("http");

  return (
    <li className={feedAdListItemClass(density)} data-feed-ad-slot="" data-feed-ad-density={density}>
      <div className={feedAdFrameClass(density)}>
        <div className={feedAdChromeBarClass(density)}>
          <span className="rounded bg-sam-app px-1.5 py-0.5 sam-text-helper font-medium text-sam-muted">
            {safeT("ui_home_feed_ad_label", { fallbackKo: "광고", fallbackEn: "Ad" })}
          </span>
          {slides.length > 1 ? (
            <div className="flex gap-1" aria-hidden={false}>
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`slide ${i + 1}`}
                  className={`h-1.5 w-1.5 rounded-full ${i === slide ? "bg-sam-primary" : "bg-sam-border"}`}
                  onClick={() => setSlide(i)}
                />
              ))}
            </div>
          ) : null}
        </div>
        <Link
          href={href === "#" ? "/" : href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className={feedAdBodyClass(density)}
          onClick={(e) => {
            if (href === "#") e.preventDefault();
          }}
        >
          <SamarketThumbnail
            src={current.imageUrl}
            size={720}
            roundedClassName="rounded-ui-rect"
            className={feedAdMediaClass(density)}
            alt={current.altText || campaign.name || t("ui_home_feed_ad_label")}
          />
          {current.headline?.trim() ? (
            <p className={feedAdHeadlineClass(density)}>{current.headline.trim()}</p>
          ) : null}
        </Link>
      </div>
    </li>
  );
}

/** Admin / docs Preview — same frame + media ratio as consumer (no fetch). */
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
