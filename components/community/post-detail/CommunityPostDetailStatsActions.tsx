"use client";

import { useEffect, useState } from "react";
import { Eye, ThumbsUp, Bookmark } from "lucide-react";
import { isPostSavedLocal, setPostSavedLocal } from "./post-detail-utils";
import { NeighborFollowButton } from "../NeighborFollowButton";
import { UserBlockButton } from "../UserBlockButton";

type Props = {
  postId: string;
  viewCount: number;
  likeCount: number;
  busy: boolean;
  onLike: () => void;
  /** 본인이 아닌 글에서만: 이웃 / 차단 */
  socialTargetUserId?: string | null;
  showSocialActions?: boolean;
};

export function CommunityPostDetailViewLine({ viewCount }: { viewCount: number }) {
  return (
    <div className="flex items-center gap-1.5 px-4 pt-4 text-[12px] font-normal leading-[1.4] text-[#6B7280]">
      <Eye className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.8} aria-hidden />
      <p>
        {viewCount.toLocaleString("ko-KR")}명이 봤어요
      </p>
    </div>
  );
}

export function CommunityPostDetailStatsActions({
  postId,
  viewCount,
  likeCount,
  busy,
  onLike,
  socialTargetUserId,
  showSocialActions = false,
}: Props) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const nextSaved = isPostSavedLocal(postId);
    setSaved((prev) => (prev === nextSaved ? prev : nextSaved));
  }, [postId]);

  const toggleSave = () => {
    const next = !saved;
    setPostSavedLocal(postId, next);
    setSaved(next);
  };
  const tid = socialTargetUserId?.trim() ?? "";

  return (
    <>
      <CommunityPostDetailViewLine viewCount={viewCount} />
      <div className="mt-3 space-y-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onLike}
            className="inline-flex min-h-11 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-[4px] border border-[#7360F2] bg-[#F3F0FF] px-4 py-2 text-[14px] font-semibold text-[#7360F2] active:scale-[0.98] disabled:opacity-50"
          >
            <ThumbsUp className="h-4 w-4" strokeWidth={2.2} />
            공감 {likeCount.toLocaleString("ko-KR")}
          </button>
          <button
            type="button"
            onClick={toggleSave}
            className={`inline-flex min-h-11 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-[4px] border px-4 py-2 text-[14px] font-semibold active:scale-[0.98] ${
              saved
                ? "border-[#7360F2] bg-[#7360F2] text-white"
                : "border-[#E5E7EB] bg-white text-[#1F2430]"
            }`}
          >
            <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} strokeWidth={2} />
            저장
          </button>
        </div>
        {showSocialActions && tid ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[#E5E7EB] pt-3">
            <div className="min-w-0 flex-1 sm:max-w-[12rem]">
              <NeighborFollowButton targetUserId={tid} />
            </div>
            <div className="min-w-0 flex-1 sm:max-w-[12rem]">
              <UserBlockButton targetUserId={tid} />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
