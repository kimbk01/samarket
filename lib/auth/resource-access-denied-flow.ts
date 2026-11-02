"use client";

import { safeTranslate } from "@/lib/i18n/safe-translate";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { DIBAY_TOAST_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { DIBAY_TOAST_MS, OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type RouterLike = {
  replace: (href: string) => void;
  push?: (href: string) => void;
};

const REDIRECT_DELAY_MS = 500;

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

  const message = resourceAccessDeniedMessage();
  showEphemeralAccessDeniedToast(message);
  const delay = options?.delayMs ?? REDIRECT_DELAY_MS;
  window.setTimeout(() => {
    if (typeof router.replace === "function") {
      router.replace(fallback);
      return;
    }
    router.push?.(fallback);
  }, delay);
}
