"use client";

import { safeTranslate } from "@/lib/i18n/safe-translate";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { DIBAY_TOAST_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { DIBAY_TOAST_MS, OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { clearPendingPushRoute, readPendingPushRoute } from "@/lib/push/pending-push-route";
import { pathsMatchForPushConsume } from "@/lib/push/push-route-consume-contract";

type RouterLike = {
  replace: (href: string) => void;
  push?: (href: string) => void;
};

const REDIRECT_DELAY_MS = 500;

/** 이동 대기(지연) 중인 키만 — 같은 순간 여러 화면의 중복 이동 방지. 이동 후 해제(2026-11-02 F-5). */
let redirectInFlightKey: string | null = null;

export function resourceAccessDeniedMessage(): string {
  return safeTranslate(getRuntimeAppLanguage(), "auth_resource_access_denied", {
    fallbackKo: "존재하지 않거나 접근할 수 없는 정보입니다.",
    fallbackEn: "This information does not exist or is not accessible.",
  });
}

/** 팝업 SSOT §3-10 (B4) — `DibayToast` 와 같은 클래스·위치(하단 토스트 줄)·시간. React 밖이라 DOM 으로 직접 그린다. */
function showEphemeralAccessDeniedToast(message: string): void {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.className = `${OverlayUi.toastStack} ${DIBAY_TOAST_Z_CLASS}`;
  const toast = document.createElement("div");
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.className = OverlayUi.toast;
  const text = document.createElement("span");
  text.className = "dibay-overlay-toast__text";
  text.textContent = message;
  toast.appendChild(text);
  el.appendChild(toast);
  document.body.appendChild(el);
  window.setTimeout(() => {
    try {
      el.remove();
    } catch {
      /* ignore */
    }
  }, DIBAY_TOAST_MS);
}

/** 존재하지 않거나 접근 불가 — toast 후 fallback 으로 replace (404/403 UI 대신) */
export function redirectResourceAccessDenied(
  router: RouterLike,
  fallback: string,
  options?: { delayMs?: number; dedupeKey?: string }
): void {
  if (typeof window === "undefined") return;
  const dedupeKey = options?.dedupeKey ?? fallback;
  if (redirectInFlightKey === dedupeKey) return;
  redirectInFlightKey = dedupeKey;

  discardPendingPushRouteForDeniedDestination(`${window.location.pathname}${window.location.search}`);

  const message = resourceAccessDeniedMessage();
  showEphemeralAccessDeniedToast(message);
  const delay = options?.delayMs ?? REDIRECT_DELAY_MS;
  window.setTimeout(() => {
    if (redirectInFlightKey === dedupeKey) redirectInFlightKey = null;
    if (typeof router.replace === "function") {
      router.replace(fallback);
      return;
    }
    router.push?.(fallback);
  }, delay);
}

/**
 * 열 수 없는 목적지가 알림·딥링크 보관 경로이면 「처리 끝」으로 정리한다 — 화면이 다시 보일 때 같은 거부로 되돌아가지 않게.
 * 네이티브는 보관 경로와 일치할 때만 지운다(`MainActivity.ackPushRouteConsumed`).
 */
function discardPendingPushRouteForDeniedDestination(currentPath: string): void {
  const pending = readPendingPushRoute();
  if (pending?.path && pathsMatchForPushConsume(currentPath, pending.path)) {
    clearPendingPushRoute();
  }
  void import("@/lib/push/native/push-route-native-bridge")
    .then(({ ackNativePushRouteConsumed }) => ackNativePushRouteConsumed({ path: currentPath }))
    .catch(() => {
      /* best-effort */
    });
}
