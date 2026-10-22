"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdFeedPost } from "@/lib/ads/types";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { philifeAppPaths } from "@domain/philife/paths";
import { CM_FEED_CARD_CLASS } from "@/lib/community/community-ui-classes";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const INLINE_AD_CACHE_TTL_MS = 60_000;

let inlineAdListCache: { ads: AdFeedPost[]; expiresAt: number } | null = null;

/** 활성 상단 고정 목록 — 현재 보고 있는 글은 제외하고 첫 건 (CM-P2-17) */
async function loadCommunityInlineAd(currentPostId: string | null): Promise<AdFeedPost | null> {
  const pick = (ads: AdFeedPost[]) => ads.find((a) => !currentPostId || a.postId !== currentPostId) ?? null;
  const now = Date.now();
  if (inlineAdListCache && inlineAdListCache.expiresAt > now) {
    return pick(inlineAdListCache.ads);
  }
  return runSingleFlight("community-inline-ad-card:active-plife", async () => {
    const againNow = Date.now();
    if (inlineAdListCache && inlineAdListCache.expiresAt > againNow) {
      return inlineAdListCache.ads;
    }
    try {
      const r = await fetch("/api/ads/active?boardKey=plife", { credentials: "include" });
      const j = (await r.json()) as { ok?: boolean; ads?: AdFeedPost[] };
      const ads = Array.isArray(j.ads) ? j.ads : [];
      inlineAdListCache = { ads, expiresAt: Date.now() + INLINE_AD_CACHE_TTL_MS };
      return ads;
    } catch {
      inlineAdListCache = { ads: [], expiresAt: Date.now() + 10_000 };
      return [];
    }
  }).then(pick);
}

export function CommunityInlineAdCard({ currentPostId = null }: { currentPostId?: string | null }) {
  const { safeT } = useI18n();
  const [ad, setAd] = useState<AdFeedPost | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const first = await loadCommunityInlineAd(currentPostId);
        if (cancel) return;
        setAd((prev) => (prev?.adId === first?.adId ? prev : first));
      } catch {
        if (!cancel) setAd((prev) => (prev == null ? prev : null));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [currentPostId]);

  /** 광고가 확정되기 전에는 자리를 잡지 않는다 — 없으면 높이 0, 스켈레톤 후 축소(CLS) 없음 (CM-P2-17) */
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
