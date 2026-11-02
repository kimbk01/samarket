"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  useMessengerSnackbarStore,
  flushPendingMessengerSnackbar,
} from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { subscribeCommunityCallHostSync } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import {
  shouldSuppressCallOverlayToasts,
  subscribeCallDockPresentation,
} from "@/lib/community-messenger/call-dock-presentation";
import { DibayToast } from "@/components/ui/dibay-overlay/DibayToast";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function readCallOverlayToastSuppress(): boolean {
  return shouldSuppressCallOverlayToasts();
}

function subscribeCallOverlayToastSuppress(onStoreChange: () => void): () => void {
  const unsubs = [subscribeCallDockPresentation(onStoreChange), subscribeCommunityCallHostSync(onStoreChange)];
  return () => {
    for (const unsub of unsubs) unsub();
  };
}

/**
 * `/community-messenger/*` 레이아웃에만 두고, API·권한·복사 등 비차단 피드백을 표시한다.
 * Call Dock·OS PiP 활성 시 snackbar 겹침 방지.
 */
export function MessengerSnackbarHost() {
  const { t } = useI18n();
  const suppress = useSyncExternalStore(
    subscribeCallOverlayToastSuppress,
    readCallOverlayToastSuppress,
    () => false
  );
  const current = useMessengerSnackbarStore((s) => s.current);
  const dismiss = useMessengerSnackbarStore((s) => s.dismiss);

  useEffect(() => {
    if (suppress) {
      // NEW-13: 억제 시작 시 일반 알림만 닫고, 오류는 유지한다.
      if (current && current.variant !== "error") dismiss();
    } else {
      // NEW-13: 통화 오버레이 종료 → 보관된 일반 알림 재생.
      flushPendingMessengerSnackbar();
    }
  }, [suppress, dismiss, current]);

  if (!current) return null;
  // NEW-13: 통화 dock·PiP 중에도 오류는 항상 표시(일반 알림만 숨김).
  if (suppress && current.variant !== "error") return null;

  /**
   * FR-D2 (10-27 Samsung 실기기): 메신저 홈에서 스낵바가 DOM 에는 있는데 화면에 안 보였다 —
   * ① 위치가 화면 맨 아래(`bottom: max(10px, safe)`)라 하단 탭 영역에 놓였고
   * ② 호스트가 `.main-hub-scroll-body`(z-index 0 쌓임 맥락) 안이라 z-200 이어도 하단 탭 아래로 깔렸다.
   * 공통 토스트(`DibayToast` — `.dibay-toast-stack`: 하단 탭이 있으면 그 위, 없으면 safe 위)를 쓰고 body 로 내보낸다.
   * 팝업 SSOT §3-10 (B4): 행동 버튼(닫은 뒤 실행) + 닫기(X) — 예전과 같이 둘 다 둔다.
   */
  const node = (
    <DibayToast
      message={current.message}
      tone={current.variant}
      action={
        current.action
          ? {
              label: current.action.label,
              onPress: () => {
                const action = current.action;
                dismiss();
                action?.onPress();
              },
            }
          : null
      }
      onDismiss={dismiss}
      dismissLabel={t("nav_close")}
    />
  );
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
