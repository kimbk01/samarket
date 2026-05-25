"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getStoreBusinessBlockedCopy,
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
  primaryCloseLabel,
}: Props) {
  const { t } = useI18n();
  const resolvedCloseLabel = primaryCloseLabel ?? t("business_phase7_618");
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

  const copy = getStoreBusinessBlockedCopy(state);
  const showProfile = showStoreBusinessProfilePreviewLink(state, firstStoreId);
  const showApply = showStoreBusinessApplyLink(state);
  const title = t(copy.titleKey);
  const body = "bodyText" in copy ? copy.bodyText : t(copy.bodyKey);

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
        aria-label={t("common_close")}
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-t-[length:var(--ui-radius-rect)] border border-sam-border bg-sam-surface p-6 shadow-2xl sm:rounded-ui-rect"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="store-business-blocked-title" className="text-lg font-semibold text-sam-fg">
          {title}
        </h2>
        <p className="mt-2 sam-text-body leading-relaxed text-sam-muted">{body}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect bg-sam-ink py-3 text-center sam-text-body font-medium text-white active:opacity-90"
          >
            {resolvedCloseLabel}
          </button>
          {showProfile && firstStoreId ? (
            <Link
              href={`/stores/owner/profile?storeId=${encodeURIComponent(firstStoreId)}`}
              onClick={onClose}
              className="rounded-ui-rect border border-signature/40 bg-signature/5 py-3 text-center sam-text-body font-medium text-signature active:opacity-90"
            >
              {t("business_phase7_619")}
            </Link>
          ) : null}
          {showApply ? (
            <Link
              href="/stores/owner/apply"
              onClick={onClose}
              className="rounded-ui-rect border border-sam-border py-3 text-center sam-text-body font-medium text-sam-fg active:bg-sam-app"
            >
              {t("store_biz_apply_store")}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
