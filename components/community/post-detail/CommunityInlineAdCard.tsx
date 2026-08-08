"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdFeedPost } from "@/lib/ads/types";
import { Star } from "lucide-react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { philifeAppPaths } from "@domain/philife/paths";
import { CM_FEED_CARD_CLASS } from "@/lib/community/community-ui-classes";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const INLINE_AD_CACHE_TTL_MS = 60_000;
let inlineAdCache: { ad: AdFeedPost | null; expiresAt: number } | null = null;

async function loadCommunityInlineAd(): Promise<AdFeedPost | null> {
  const now = Date.now();
  if (inlineAdCache && inlineAdCache.expiresAt > now) {
    return inlineAdCache.ad;
  }
  return runSingleFlight("community-inline-ad-card:active-plife", async () => {
    const againNow = Date.now();
    if (inlineAdCache && inlineAdCache.expiresAt > againNow) {
      return inlineAdCache.ad;
    }
    try {
      const r = await fetch("/api/ads/active?boardKey=plife", { credentials: "include" });
      const j = (await r.json()) as { ok?: boolean; ads?: AdFeedPost[] };
      const first = j.ads?.[0] ?? null;
      inlineAdCache = { ad: first, expiresAt: Date.now() + INLINE_AD_CACHE_TTL_MS };
      return first;
    } catch {
      inlineAdCache = { ad: null, expiresAt: Date.now() + 10_000 };
      return null;
    }
  });
}

export function CommunityInlineAdCard() {
  const { t, safeT } = useI18n();
  const [ad, setAd] = useState<AdFeedPost | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const first = await loadCommunityInlineAd();
        if (cancel) return;
        setAd((prev) => (prev?.adId === first?.adId ? prev : first));
      } catch {
        if (!cancel) setAd((prev) => (prev == null ? prev : null));
      } finally {
        if (!cancel) setTried((prev) => (prev ? prev : true));
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  if (!tried) {
    return (
      <section className="mt-4">
        <div className="h-24 animate-pulse rounded-[var(--cm-radius-card)] border border-[var(--cm-border)] bg-[var(--cm-card-bg)] shadow-[var(--cm-shadow-card)]">
          <div className="m-3 h-[calc(100%-1.5rem)] rounded-2xl bg-[var(--cm-primary-soft)]" />
        </div>
      </section>
    );
  }
  if (!ad) return null;

  const href = ad.postId ? philifeAppPaths.post(ad.postId) : "#";
  const thumb = ad.postImages?.[0] ?? null;

  return (
    <section className="mt-4">
      <div className={CM_FEED_CARD_CLASS}>
        <Link
          href={href}
          className="block active:bg-[var(--cm-primary-soft)]/50"
          onClick={(e) => {
            if (href === "#") e.preventDefault();
          }}
        >
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <p className="m-0 line-clamp-2 text-[15px] font-semibold leading-[1.4] text-[var(--cm-text)]">{ad.postTitle}</p>
              <p className="mt-1 text-[12px] font-normal leading-[1.4] text-[var(--cm-text-muted)]">
                <span className="text-[var(--cm-text)]">{ad.advertiserName}</span>
                <span className="mx-1">·</span>
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
                  {safeT("community_top_fix_badge", {
                    fallbackKo: "상단 고정",
                    fallbackEn: "Pinned",
                  })}
                </span>
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-[12px] font-normal text-[var(--cm-text-muted)]">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                {t("community_ad_rating")}
              </p>
              {ad.postSummary ? (
                <p className="mt-2 line-clamp-2 rounded-2xl bg-[var(--cm-page-bg)] px-2.5 py-2 text-[13px] font-normal leading-[1.45] text-[var(--cm-text-muted)]">
                  {ad.postSummary}
                </p>
              ) : null}
            </div>
            {thumb ? (
              <SamarketThumbnail
                src={thumb}
                size={80}
                roundedClassName="rounded-2xl"
                className="ring-1 ring-[var(--cm-border)]"
              />
            ) : null}
          </div>
        </Link>
      </div>
    </section>
  );
}
