"use client";

import Link from "next/link";
import type { AdFeedPost } from "@/lib/ads/types";

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

/** 페이스북·인스타 피드형 스폰서 카드 — 본문 카드 톤과 맞춤 */
export function AdPostCard({ ad, href }: AdPostCardProps) {
  const linkHref = href ?? `/philife/${ad.postId}`;

  return (
    <article className="border-b border-sam-border bg-sam-surface">
      <Link href={linkHref} className="block active:bg-sam-app/80">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sam-surface-muted sam-text-xxs font-bold uppercase text-sam-muted"
            aria-hidden
          >
            AD
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate sam-text-body font-semibold text-sam-fg">{ad.advertiserName}</p>
            <p className="sam-text-helper text-sam-muted">
              스폰서 · {ad.locationLabel ? `${ad.locationLabel} · ` : ""}
              {daysLeft(ad.endAt)}
            </p>
          </div>
        </div>
        <div className="space-y-1.5 px-3 pb-3">
          <p className="sam-text-body font-semibold leading-snug text-sam-fg">{ad.postTitle}</p>
          {ad.postSummary ? (
            <p className="line-clamp-2 sam-text-body leading-relaxed text-sam-fg">{ad.postSummary}</p>
          ) : null}
          <p className="sam-text-helper text-signature">자세히 보기</p>
        </div>
      </Link>
    </article>
  );
}
