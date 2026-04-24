"use client";

import Link from "next/link";
import type { AdFeedPost } from "@/lib/ads/types";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";

interface AdPostCardProps {
  ad: AdFeedPost;
  href?: string;
}

function daysLeft(endAt: string): string {
  const ms = Date.parse(endAt) - Date.now();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return "오늘 만료";
  if (days === 1) return "내일 만료";
  return `${days}일 남음`;
}

/** 필라이프 피드 스폰서 카드 — 전역 카드/리스트 규격 */
export function AdPostCard({ ad, href }: AdPostCardProps) {
  const linkHref = href ?? `/philife/${ad.postId}`;

  return (
    <article className={PHILIFE_FB_CARD_CLASS}>
      <Link href={linkHref} className="block active:bg-sam-surface-muted">
        <div className="flex items-center gap-2.5 sam-card-pad-x py-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sam-md border border-sam-primary-border bg-sam-primary-soft sam-text-xxs uppercase text-sam-primary"
            aria-hidden
          >
            AD
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate sam-text-card-title">{ad.advertiserName}</p>
            <p className="sam-text-helper">
              스폰서 · {ad.locationLabel ? `${ad.locationLabel} · ` : ""}
              {daysLeft(ad.endAt)}
            </p>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-sam-border-soft sam-card-pad-x pb-3 pt-2">
          <p className="sam-text-card-title">{ad.postTitle}</p>
          {ad.postSummary ? (
            <p className="line-clamp-2 sam-text-body-secondary">{ad.postSummary}</p>
          ) : null}
          <p className="sam-text-body-secondary font-medium text-sam-primary">자세히 보기</p>
        </div>
      </Link>
    </article>
  );
}
