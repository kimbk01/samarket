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
    <article className="border-b border-gray-200 bg-white">
      <Link href={linkHref} className="block active:bg-gray-50/80">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold uppercase text-gray-500"
            aria-hidden
          >
            AD
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-gray-900">{ad.advertiserName}</p>
            <p className="text-[12px] text-gray-500">
              스폰서 · {ad.locationLabel ? `${ad.locationLabel} · ` : ""}
              {daysLeft(ad.endAt)}
            </p>
          </div>
        </div>
        <div className="space-y-1.5 px-3 pb-3">
          <p className="text-[15px] font-semibold leading-snug text-gray-900">{ad.postTitle}</p>
          {ad.postSummary ? (
            <p className="line-clamp-2 text-[14px] leading-relaxed text-gray-700">{ad.postSummary}</p>
          ) : null}
          <p className="text-[12px] text-signature">자세히 보기</p>
        </div>
      </Link>
    </article>
  );
}
