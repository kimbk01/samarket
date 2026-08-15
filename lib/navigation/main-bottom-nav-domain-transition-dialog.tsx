"use client";

import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { BottomNavTransitionConfirmCopy } from "@/lib/navigation/main-bottom-nav-transition-copy";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

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

  return (
    <DibayConfirmDialog
      open
      title={title}
      description={message}
      cancelLabel={t("common_cancel")}
      confirmLabel={t("common_confirm")}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmTone="primary"
      blocking={false}
    />
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
    flushSync(() => {
      setPending(null);
    });
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
    [],
  );

  return {
    pendingTransition: pending,
    requestTransition,
    confirmTransition,
    cancelTransition,
  };
}
