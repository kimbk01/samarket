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

/** 필라이프 피드 스폰서 카드 — Viber 톤 */
export function AdPostCard({ ad, href }: AdPostCardProps) {
  const linkHref = href ?? `/philife/${ad.postId}`;

  return (
    <article className={PHILIFE_FB_CARD_CLASS}>
      <Link href={linkHref} className="block active:bg-[#F7F8FA]/80">
        <div className="flex items-center gap-2.5 px-3 py-3 sm:px-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-[#F3F0FF] text-[11px] font-medium uppercase text-[#7360F2]"
            aria-hidden
          >
            AD
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[#1F2430]">{ad.advertiserName}</p>
            <p className="text-[12px] text-[#6B7280]">
              스폰서 · {ad.locationLabel ? `${ad.locationLabel} · ` : ""}
              {daysLeft(ad.endAt)}
            </p>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-[#E5E7EB] px-3 pb-3 pt-2 sm:px-4">
          <p className="text-[15px] font-semibold leading-[1.4] text-[#1F2430]">{ad.postTitle}</p>
          {ad.postSummary ? (
            <p className="line-clamp-2 text-[13px] leading-[1.45] text-[#6B7280]">{ad.postSummary}</p>
          ) : null}
          <p className="text-[13px] font-semibold text-[#7360F2]">자세히 보기</p>
        </div>
      </Link>
    </article>
  );
}
