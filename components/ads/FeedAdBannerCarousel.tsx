"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";
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
 * In-feed 3-slide banner. Renders nothing when no campaign / no images.
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
    <li className="list-none px-2 py-2">
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        <div className="flex items-center justify-between px-3 pt-2">
          <span className="rounded bg-sam-app px-1.5 py-0.5 sam-text-helper font-medium text-sam-muted">
            {safeT("ui_home_feed_ad_label", { fallbackKo: "광고", fallbackEn: "Ad" })}
          </span>
          {slides.length > 1 ? (
            <div className="flex gap-1">
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
          className="block p-3"
          onClick={(e) => {
            if (href === "#") e.preventDefault();
          }}
        >
          <SamarketThumbnail
            src={current.imageUrl}
            size={720}
            roundedClassName="rounded-ui-rect"
            className="aspect-[16/9] w-full object-cover"
            alt={current.altText || campaign.name || t("ui_home_feed_ad_label")}
          />
          {current.headline ? (
            <p className="mt-2 line-clamp-2 sam-text-body font-semibold text-sam-fg">
              {current.headline}
            </p>
          ) : null}
        </Link>
        {slides.length > 1 ? (
          <div className="flex justify-between px-3 pb-3">
            <button
              type="button"
              className="sam-text-helper text-sam-muted"
              onClick={() => setSlide((s) => (s - 1 + slides.length) % slides.length)}
            >
              ‹
            </button>
            <button
              type="button"
              className="sam-text-helper text-sam-muted"
              onClick={() => setSlide((s) => (s + 1) % slides.length)}
            >
              ›
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
