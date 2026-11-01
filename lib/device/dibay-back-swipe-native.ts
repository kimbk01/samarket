import { registerPlugin } from "@capacitor/core";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/**
 * iOS 화면 가장자리 스와이프 뒤로가기 켜기·끄기 — 네이티브 `DibayBackSwipe` 플러그인 (Owner 승인 2026-11-02).
 * 기본 꺼짐. 켜는 화면이 사라질 때 반드시 끈다. 웹·Android·플러그인이 없는 예전 iOS 앱: 아무 일도 하지 않는다.
 */
export const DIBAY_BACK_SWIPE_PLUGIN_ID = "DibayBackSwipe";

type DibayBackSwipePlugin = {
  setEnabled(options: { enabled: boolean }): Promise<unknown>;
};

const DibayBackSwipe = registerPlugin<DibayBackSwipePlugin>(DIBAY_BACK_SWIPE_PLUGIN_ID);

type WindowWithCapacitorHeaders = Window & {
  Capacitor?: { PluginHeaders?: Array<{ name?: string }> };
};

function nativePluginMayExist(): boolean {
  if (typeof window === "undefined") return false;
  const headers = (window as WindowWithCapacitorHeaders).Capacitor?.PluginHeaders;
  if (!Array.isArray(headers)) return true;
  return headers.some((header) => header?.name === DIBAY_BACK_SWIPE_PLUGIN_ID);
}

/** true = 네이티브가 받아들임 */
export async function setDibayBackSwipeEnabled(enabled: boolean): Promise<boolean> {
  if (resolveCapacitorShellPlatform() !== "ios") return false;
  if (!nativePluginMayExist()) return false;
  try {
    await DibayBackSwipe.setEnabled({ enabled });
    return true;
  } catch {
    return false;
  }
}
