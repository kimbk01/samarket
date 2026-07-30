/**
 * 메신저 허브 표면 SSOT — iOS / Android(APK) / window · phone/tablet/desktop · portrait/landscape · hub/split.
 *
 * 스크롤 권위는 layout 으로만 갈라진다:
 * - hub (portrait 또는 <768): `[data-messenger-hub-list-scroll]` + StickyHeader safe-top
 * - split (768+ landscape): 동일 list SSOT + SplitTopBar safe-top + 좌측 pane BottomNav
 *
 * platform/form 은 DOM `data-messenger-hub-*` 로 찍어 iOS·APK·window 가 서로 덮어쓰지 않게 한다.
 * DO NOT width-only 로 platform/orient 를 합치지 말 것.
 */
import {
  APP_MESSENGER_SPLIT_MIN_PX,
  matchesMessengerSplitViewport,
} from "@/lib/ui/app-viewport-layout-breakpoints";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";

export type MessengerHubShellPlatform = "ios" | "android" | "window";
export type MessengerHubForm = "phone" | "tablet" | "desktop";
export type MessengerHubOrientation = "portrait" | "landscape";
export type MessengerHubLayoutMode = "hub" | "split";

export type MessengerHubSurface = {
  platform: MessengerHubShellPlatform;
  form: MessengerHubForm;
  orientation: MessengerHubOrientation;
  layout: MessengerHubLayoutMode;
};

/** Capacitor iOS/Android shell → 그 외 브라우저·데스크톱 창은 window */
export function resolveMessengerHubShellPlatform(): MessengerHubShellPlatform {
  if (typeof window === "undefined") return "window";
  const shell = resolveCapacitorShellPlatform();
  if (shell === "ios" || shell === "android") return shell;
  if (isCapacitorNativePlatform()) {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (/iphone|ipad|ipod/i.test(ua)) return "ios";
    if (/android/i.test(ua)) return "android";
  }
  return "window";
}

export function resolveMessengerHubOrientation(
  width: number,
  height: number
): MessengerHubOrientation {
  return width > height ? "landscape" : "portrait";
}

/**
 * form — touch+폭으로 phone/tablet, 비터치 넓은 창은 desktop(window).
 * layout(split) 판정과 독립 — 세로 태블릿도 tablet 으로 남긴다.
 */
export function resolveMessengerHubForm(input: {
  width: number;
  isTouch: boolean;
  platform: MessengerHubShellPlatform;
}): MessengerHubForm {
  const { width, isTouch, platform } = input;
  if (platform === "window" && !isTouch && width >= 1280) return "desktop";
  if (width >= APP_MESSENGER_SPLIT_MIN_PX && isTouch) return "tablet";
  if (width >= APP_MESSENGER_SPLIT_MIN_PX && platform === "window") {
    return width >= 1280 ? "desktop" : "tablet";
  }
  return "phone";
}

export function resolveMessengerHubLayoutMode(isSplitViewport: boolean): MessengerHubLayoutMode {
  return isSplitViewport ? "split" : "hub";
}

export function readMessengerHubSurfaceNow(): MessengerHubSurface {
  if (typeof window === "undefined") {
    return {
      platform: "window",
      form: "phone",
      orientation: "portrait",
      layout: "hub",
    };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const platform = resolveMessengerHubShellPlatform();
  const isTouch =
    typeof navigator !== "undefined" ? navigator.maxTouchPoints >= 1 : false;
  const orientation = resolveMessengerHubOrientation(width, height);
  const form = resolveMessengerHubForm({ width, isTouch, platform });
  const layout = resolveMessengerHubLayoutMode(matchesMessengerSplitViewport());
  return { platform, form, orientation, layout };
}

/** DOM data attrs — ResponsiveShell / list scroll 루트에 동일 키 유지 */
export function messengerHubSurfaceDataAttrs(surface: MessengerHubSurface): Record<string, string> {
  return {
    "data-messenger-hub-platform": surface.platform,
    "data-messenger-hub-form": surface.form,
    "data-messenger-hub-orientation": surface.orientation,
    "data-messenger-hub-layout": surface.layout,
  };
}
