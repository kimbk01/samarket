"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import {
  getStoreBusinessBlockedTitleBody,
  showStoreBusinessApplyLink,
  showStoreBusinessProfilePreviewLink,
} from "@/components/business/store-business-blocked-copy";

type Props = {
  open: boolean;
  onClose: () => void;
  state: OwnerStoreGateState;
  firstStoreId?: string;
  /** 기본값: 내 정보로 — 내정보 위 모달에서는 "확인" 등으로 바꿀 수 있음 */
  primaryCloseLabel?: string;
};

export function StoreBusinessBlockedModal({
  open,
  onClose,
  state,
  firstStoreId,
  primaryCloseLabel = "내 정보로",
}: Props) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const { title, body } = getStoreBusinessBlockedTitleBody(state);
  const showProfile = showStoreBusinessProfilePreviewLink(state, firstStoreId);
  const showApply = showStoreBusinessApplyLink(state);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-business-blocked-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-t-[length:var(--ui-radius-rect)] border border-sam-border bg-sam-surface p-6 shadow-2xl sm:rounded-ui-rect"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="store-business-blocked-title" className="text-lg font-semibold text-sam-fg">
          {title}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-sam-muted">{body}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect bg-sam-ink py-3 text-center text-[14px] font-medium text-white active:opacity-90"
          >
            {primaryCloseLabel}
          </button>
          {showProfile && firstStoreId ? (
            <Link
              href={`/my/business/profile?storeId=${encodeURIComponent(firstStoreId)}`}
              onClick={onClose}
              className="rounded-ui-rect border border-signature/40 bg-signature/5 py-3 text-center text-[14px] font-medium text-signature active:opacity-90"
            >
              매장 설정 (공개 페이지 미리보기용)
            </Link>
          ) : null}
          {showApply ? (
            <Link
              href="/my/business/apply"
              onClick={onClose}
              className="rounded-ui-rect border border-sam-border py-3 text-center text-[14px] font-medium text-sam-fg active:bg-sam-app"
            >
              매장 등록 신청
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
