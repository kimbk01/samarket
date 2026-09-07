"use client";

import { useState } from "react";
import { AdProductSelector } from "./AdProductSelector";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface AdApplyButtonProps {
  postId: string;
  postTitle: string;
  boardKey?: string;
  /** 이미 active 광고가 있는 게시글이면 true */
  hasActiveAd?: boolean;
}

/**
 * Community member TOP FIXED apply (post_ads) — NOT Admin Feed Advertisement, NOT Trade「더 알리기」.
 */
export function AdApplyButton({
  postId,
  postTitle,
  boardKey = "plife",
  hasActiveAd = false,
}: AdApplyButtonProps) {
  const me = getCurrentUser();
  const { safeT } = useI18n();
  const [open, setOpen] = useState(false);
  const [successAdId, setSuccessAdId] = useState<string | null>(null);

  if (!me?.id) return null;

  const { balance } = useUserPointBalance(me.id);

  if (successAdId) {
    return (
      <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 px-3 py-2.5 sam-text-body-secondary text-emerald-800">
        {safeT("community_top_fix_apply_done", {
          fallbackKo: "상단 고정 신청이 완료되었습니다. 관리자 승인 후 노출됩니다.",
          fallbackEn: "Top-pin request submitted. It appears after admin approval.",
        })}
      </div>
    );
  }

  if (hasActiveAd) {
    return (
      <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2.5 sam-text-body-secondary text-amber-800">
        {safeT("community_top_fix_active", {
          fallbackKo: "이 글은 현재 상단 고정 중입니다.",
          fallbackEn: "This post is currently pinned at the top.",
        })}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2.5 sam-text-body-secondary font-semibold text-amber-800 hover:bg-amber-100"
      >
        {safeT("community_top_fix_cta", {
          fallbackKo: "Community 상위노출",
          fallbackEn: "Community top exposure",
        })}
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
