"use client";

import { safeTranslate } from "@/lib/i18n/safe-translate";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

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

function showEphemeralAccessDeniedToast(message: string): void {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.className =
    "pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+3.5rem)] z-[140] max-w-[min(92vw,22rem)] -translate-x-1/2 rounded-ui-rect bg-neutral-900/92 px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-lg";
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => {
    try {
      el.remove();
    } catch {
      /* ignore */
    }
  }, 2400);
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
