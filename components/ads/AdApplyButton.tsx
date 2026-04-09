"use client";

import { useState } from "react";
import { AdProductSelector } from "./AdProductSelector";
import { getUserPointBalance } from "@/lib/ads/mock-ad-data";
import { getCurrentUser } from "@/lib/auth/get-current-user";

interface AdApplyButtonProps {
  postId: string;
  postTitle: string;
  boardKey?: string;
  /** 이미 active 광고가 있는 게시글이면 true */
  hasActiveAd?: boolean;
}

export function AdApplyButton({
  postId,
  postTitle,
  boardKey = "plife",
  hasActiveAd = false,
}: AdApplyButtonProps) {
  const me = getCurrentUser();
  const [open, setOpen] = useState(false);
  const [successAdId, setSuccessAdId] = useState<string | null>(null);

  if (!me?.id) return null;

  const balance = getUserPointBalance(me.id);

  if (successAdId) {
    return (
      <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
        광고 신청이 완료되었습니다. 관리자 승인 후 노출됩니다.
      </div>
    );
  }

  if (hasActiveAd) {
    return (
      <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
        이 게시글은 현재 광고 중입니다.
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] font-semibold text-amber-800 hover:bg-amber-100"
      >
        📢 이 글 광고 신청하기
      </button>

      {open && (
        <AdProductSelector
          boardKey={boardKey}
          postId={postId}
          postTitle={postTitle}
          userPointBalance={balance}
          onClose={() => setOpen(false)}
          onSuccess={(adId) => {
            setOpen(false);
            setSuccessAdId(adId);
          }}
        />
      )}
    </>
  );
}
