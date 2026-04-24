"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdFeedPost } from "@/lib/ads/types";
import { Star } from "lucide-react";
import { philifeAppPaths } from "@domain/philife/paths";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";
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
  const [ad, setAd] = useState<AdFeedPost | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const first = await loadCommunityInlineAd();
        if (cancel) return;
        setAd(first);
      } catch {
        if (!cancel) setAd(null);
      } finally {
        if (!cancel) setTried(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  if (!tried) {
    return (
      <section className="mt-2 px-4 py-4">
        <div className="h-24 animate-pulse rounded-[4px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(31,36,48,0.05)]">
          <div className="m-3 h-[calc(100%-1.5rem)] rounded-[4px] bg-[#EEF0F4]" />
        </div>
      </section>
    );
  }
  if (!ad) return null;

  const href = ad.postId ? philifeAppPaths.post(ad.postId) : "#";
  const thumb = ad.postImages?.[0] ?? null;

  return (
    <section className="mt-2 px-4 pb-2">
      <div className={PHILIFE_FB_CARD_CLASS}>
        <Link
          href={href}
          className="block px-4 py-4 active:bg-[#F7F8FA]/80"
          onClick={(e) => {
            if (href === "#") e.preventDefault();
          }}
        >
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <p className="m-0 line-clamp-2 text-[15px] font-semibold leading-[1.4] text-[#1F2430]">{ad.postTitle}</p>
              <p className="mt-1 text-[12px] font-normal leading-[1.4] text-[#6B7280]">
                <span className="text-[#1F2430]">{ad.advertiserName}</span>
                <span className="mx-1">·</span>
                <span className="rounded-[4px] bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">광고</span>
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-[12px] font-normal text-[#9CA3AF]">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                5.0 · 후기 노출
              </p>
              {ad.postSummary ? (
                <p className="mt-2 line-clamp-2 rounded-[4px] bg-[#F7F8FA] px-2.5 py-2 text-[13px] font-normal leading-[1.45] text-[#6B7280]">
                  {ad.postSummary}
                </p>
              ) : null}
            </div>
            {thumb ? (
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[4px] ring-1 ring-[#E5E7EB]">
                <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
              </div>
            ) : null}
          </div>
        </Link>
      </div>
    </section>
  );
}
