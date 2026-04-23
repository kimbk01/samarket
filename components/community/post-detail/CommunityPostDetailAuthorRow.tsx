"use client";

import { formatTimeAgo } from "@/lib/utils/format";

type Props = {
  authorName: string;
  locationLabel: string;
  createdAt: string;
  /** 모임 등 보조 메타(조회·댓글 수) */
  subline?: string;
};

export function CommunityPostDetailAuthorRow({ authorName, locationLabel, createdAt, subline }: Props) {
  const time =
    createdAt && !Number.isNaN(Date.parse(createdAt)) ? formatTimeAgo(createdAt, "ko-KR") : "";
  const initial = (authorName?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div className="mt-3 flex min-w-0 items-start gap-3 px-4">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F3F0FF] text-[15px] font-semibold text-[#7360F2]"
        aria-hidden
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-[1.4] text-[#1F2430]">{authorName || "익명"}</p>
        <p className="mt-0.5 text-[12px] font-normal leading-[1.4] text-[#6B7280]">
          {locationLabel ? <span>{locationLabel}</span> : null}
          {locationLabel && time ? <span className="mx-1">·</span> : null}
          {time ? <span>{time}</span> : null}
        </p>
        {subline ? <p className="mt-1 text-[12px] font-normal leading-[1.4] text-[#9CA3AF]">{subline}</p> : null}
      </div>
    </div>
  );
}
