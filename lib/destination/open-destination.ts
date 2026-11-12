"use client";

/**
 * Scope B — the one way every CTA opens its destination (EVT-04).
 * internal / event → app router (same WebView). external → in-app browser on native
 * (@capacitor/browser, already in installed binaries), new tab on the web. Never navigates
 * the app WebView to a foreign origin.
 */
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { IN_APP_BROWSER_TOOLBAR_COLOR } from "@/lib/platform/in-app-browser-style";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import {
  destinationHref,
  parseDestinationHref,
  type DestinationRef,
} from "@/lib/destination/destination-contract";

type RouterLike = { push: (href: string) => void };

/**
 * DS-9 (Owner 「설계안대로」 2026-11-04): 링크를 열지 못하면 화면은 그대로 두고 「열 수 없는 링크입니다」를 알린다(무반응 금지).
 * 전역 토스트가 없어 앱 공용 안내창(`dibayAlert`)을 쓴다.
 */
export function notifyDestinationOpenFailed(): void {
  if (typeof window === "undefined") return;
  const lang = getRuntimeAppLanguage();
  const title = safeTranslate(lang, "destination_open_failed_title");
  void import("@/components/ui/dibay-overlay/DibayAppDialogProvider")
    .then(({ dibayAlert }) => dibayAlert({ title }))
    .catch(() => {});
}

/** @returns false when the URL could not be handed to a browser (DS-9 안내는 이 함수가 띄운다). */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (!url.startsWith("https://")) {
    notifyDestinationOpenFailed();
    return false;
  }
  // `noopener` 이면 브라우저가 열어도 null 을 돌려주므로 반환값으로 판정하지 않는다 — 예외만 실패로 본다
  const openWeb = (): boolean => {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  };
  try {
    if (!isCapacitorNativePlatform()) return openWeb();
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, toolbarColor: IN_APP_BROWSER_TOOLBAR_COLOR });
      return true;
    } catch {
      return openWeb();
    }
  } catch {
    notifyDestinationOpenFailed();
    return false;
  }
}

/** @returns false when the destination is invalid (caller keeps the user where they are · DS-9 안내 표시). */
export function openDestination(target: DestinationRef | string, router: RouterLike): boolean {
  let ref: DestinationRef;
  if (typeof target === "string") {
    const parsed = parseDestinationHref(target);
    if (!parsed.ok) {
      notifyDestinationOpenFailed();
      return false;
    }
    ref = parsed.ref;
  } else {
    ref = target;
  }
  if (ref.kind === "external_url") {
    if (!ref.url.startsWith("https://")) {
      notifyDestinationOpenFailed();
      return false;
    }
    void openExternalUrl(ref.url);
    return true;
  }
  try {
    router.push(destinationHref(ref));
    return true;
  } catch {
    notifyDestinationOpenFailed();
    return false;
  }
}
