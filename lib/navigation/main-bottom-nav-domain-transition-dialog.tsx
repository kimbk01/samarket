"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { BottomNavTransitionConfirmCopy } from "@/lib/navigation/main-bottom-nav-transition-copy";

type PendingTransition = {
  copy: BottomNavTransitionConfirmCopy;
  proceed: () => void;
};

export function MainBottomNavDomainTransitionDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingTransition | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t, safeT } = useI18n();
  if (!pending) return null;

  const title =
    pending.copy.kind === "messenger"
      ? t("nav_messenger_tab_confirm_title")
      : t("nav_cross_domain_confirm_title");

  const message =
    pending.copy.kind === "messenger"
      ? t("nav_messenger_tab_confirm_message")
      : pending.copy.copy.kind === "from_to"
        ? t("nav_cross_domain_confirm_from_to", {
            fromLabel: safeT(pending.copy.copy.fromLabelKey),
            toLabel: safeT(pending.copy.copy.toLabelKey),
          })
        : t("nav_cross_domain_confirm_to_only", {
            toLabel: safeT(pending.copy.copy.toLabelKey),
          });

  const confirmAria =
    pending.copy.kind === "messenger"
      ? t("nav_messenger_tab_confirm_aria")
      : t("nav_cross_domain_confirm_aria");

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="main-bottom-nav-cross-domain-title"
      aria-describedby="main-bottom-nav-cross-domain-message"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={t("common_close")}
        onClick={onCancel}
      />
      <div className="relative z-[1] w-full max-w-sm rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sam-elevated">
        <h2
          id="main-bottom-nav-cross-domain-title"
          className="text-base font-bold text-sam-fg"
        >
          {title}
        </h2>
        <p id="main-bottom-nav-cross-domain-message" className="mt-2 text-sm leading-relaxed text-sam-muted">
          {message}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex min-h-11 flex-1 touch-manipulation select-none items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface text-sm font-semibold text-sam-muted transition active:scale-[0.98] active:bg-sam-app"
          >
            {t("common_cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            aria-label={confirmAria}
            className="flex min-h-11 flex-1 touch-manipulation select-none items-center justify-center rounded-ui-rect border border-sam-primary bg-sam-primary text-sm font-semibold text-white transition active:scale-[0.98]"
          >
            {t("common_confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 하단 탭 이동 확인 — pending·request/confirm/cancel (메신저·허브 교차) */
export function useMainBottomNavDomainTransition(_pathname: string | null | undefined) {
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const pendingRef = useRef<PendingTransition | null>(null);

  const cancelTransition = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  const confirmTransition = useCallback(() => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.proceed();
  }, []);

  const requestTransition = useCallback(
    (copy: BottomNavTransitionConfirmCopy | null, proceed: () => void) => {
      if (copy == null) {
        proceed();
        return;
      }
      /** 확인 전에는 router 이동·push 슬라이드 시작 금지 */
      const next = { copy, proceed };
      pendingRef.current = next;
      setPending(next);
    },
    []
  );

  return {
    pendingTransition: pending,
    requestTransition,
    confirmTransition,
    cancelTransition,
  };
}
