"use client";

import { useEffect } from "react";
import { ProfileEditForm } from "@/components/my/edit/ProfileEditForm";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MypageProfileEditModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mypage-profile-edit-title"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="닫기" onClick={onClose} />
      <div
        className="relative z-[1] flex max-h-[min(94dvh,800px)] w-full max-w-lg flex-col rounded-t-2xl border border-ig-border bg-background shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ig-border bg-[var(--sub-bg)] px-4 py-3">
          <div>
            <h2 id="mypage-profile-edit-title" className="text-[17px] font-semibold text-foreground">
              프로필 수정
            </h2>
            <p className="text-[12px] text-[var(--text-muted)]">닉네임·사진·프로필·지역·동네</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
            aria-label="닫기"
          >
            <span className="text-[22px] leading-none">×</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <ProfileEditForm variant="modal" onRequestClose={onClose} />
        </div>
      </div>
    </div>
  );
}
