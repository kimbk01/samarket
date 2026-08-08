"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import type { AdFeedPost } from "@/lib/ads/types";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";

interface AdPostCardProps {
  ad: AdFeedPost;
  href?: string;
}

function daysLeft(endAt: string, endsToday: string, endsTomorrow: string, daysLeftFn: (n: number) => string): string {
  const ms = Date.parse(endAt) - Date.now();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return endsToday;
  if (days === 1) return endsTomorrow;
  return daysLeftFn(days);
}

/**
 * Community member TOP FIXED content card — same post geometry as feed, not a Feed Ad banner.
 * Label: 「상단 고정」 only (never 「광고」 / AD / Sponsored).
 */
export function AdPostCard({ ad, href }: AdPostCardProps) {
  const { t, safeT } = useI18n();
  const linkHref = href ?? `/philife/${ad.postId}`;

  return (
    <article className={PHILIFE_FB_CARD_CLASS} data-community-top-fixed="">
      <Link href={linkHref} className="block active:bg-sam-surface-muted">
        <div className="flex items-center gap-2.5 sam-card-pad-x py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate sam-text-card-title">{ad.advertiserName}</p>
            <p className="sam-text-helper text-sam-muted">
              <span className="rounded bg-sam-app px-1.5 py-0.5 font-medium text-sam-muted">
                {safeT("community_top_fix_badge", {
                  fallbackKo: "상단 고정",
                  fallbackEn: "Pinned",
                })}
              </span>
              {ad.locationLabel ? ` · ${ad.locationLabel}` : ""}
              {" · "}
              {daysLeft(
                ad.endAt,
                safeT("community_top_fix_ends_today", {
                  fallbackKo: "오늘 만료",
                  fallbackEn: "Ends today",
                }),
                safeT("community_top_fix_ends_tomorrow", {
                  fallbackKo: "내일 만료",
                  fallbackEn: "Ends tomorrow",
                }),
                (n) =>
                  safeT("community_top_fix_days_left", {
                    fallbackKo: `${n}일 남음`,
                    fallbackEn: `${n}d left`,
                  })
              )}
            </p>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-sam-border-soft sam-card-pad-x pb-3 pt-2">
          <p className="sam-text-card-title">{ad.postTitle}</p>
          {ad.postSummary ? (
            <p className="line-clamp-2 sam-text-body-secondary">{ad.postSummary}</p>
          ) : null}
          <p className="sam-text-body-secondary font-medium text-sam-primary">{t("ui_ad_view_details")}</p>
        </div>
      </Link>
    </article>
  );
}
