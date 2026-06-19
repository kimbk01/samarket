/**
 * 채팅방 셸 플랫폼 분기 — Android / iOS / tablet / embedded.
 * composer fixed 이동 없이 셸 padding-bottom 으로만 키보드 overlay 보정.
 */

import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import { readSamarketShellKeyboardBottomInsetCssPx } from "@/lib/platform/samarket-shell-keyboard";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";
import { CHAT_SHELL_KEYBOARD_OVERLAY_MIN_PX } from "@/lib/ui/messenger-chat-viewport-tuning";

export type ChatViewportShellPlatform = "ios" | "android" | "web";

export type ChatViewportShellLayoutMode = "narrow" | "embedded" | "wide";

/** iOS Safari / WKWebView / iPad */
export function isChatViewportIosPlatform(): boolean {
  return isLikelyIosWebKit();
}

/** Android Chrome / WebView / Capacitor */
export function isChatViewportAndroidPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android") return true;
  return /Android/i.test(navigator.userAgent);
}

export function resolveChatViewportShellPlatform(): ChatViewportShellPlatform {
  if (isChatViewportIosPlatform()) return "ios";
  if (isChatViewportAndroidPlatform()) return "android";
  return "web";
}

/**
 * 키보드 open → keyboard overlay. closed → Android nav / gesture gap (visualViewport).
 * iOS safe-area 는 CSS env() 로 shell·timeline 에 추가.
 */
export function resolveChatBottomInsetCssPx(): number {
  const keyboard = resolveChatShellKeyboardOverlayCssPx();
  if (keyboard >= CHAT_SHELL_KEYBOARD_OVERLAY_MIN_PX) return keyboard;

  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;

  const gap = window.innerHeight - (vv.offsetTop + vv.height);
  const rounded = Math.max(0, Math.round(gap));
  if (rounded < 8 || rounded > 120) return 0;
  return rounded;
}

/** @deprecated use resolveChatBottomInsetCssPx — keyboard open 시에만 non-zero */
export function resolveChatShellNavigationInsetCssPx(keyboardOffsetPx: number): number {
  if (keyboardOffsetPx >= CHAT_SHELL_KEYBOARD_OVERLAY_MIN_PX) return 0;
  return resolveChatBottomInsetCssPx();
}

export function resolveChatShellKeyboardOverlayCssPx(): number {
  if (typeof window === "undefined") return 0;

  const nativeInset = readSamarketShellKeyboardBottomInsetCssPx();
  if (nativeInset != null && nativeInset >= CHAT_SHELL_KEYBOARD_OVERLAY_MIN_PX) {
    return nativeInset;
  }

  const vv = window.visualViewport;
  if (!vv) return 0;

  const layoutBottom = vv.offsetTop + vv.height;
  const gap = window.innerHeight - layoutBottom;
  const rounded = Math.max(0, Math.round(gap));

  if (rounded < CHAT_SHELL_KEYBOARD_OVERLAY_MIN_PX) return 0;

  /**
   * iOS: 키보드 open 시 offsetTop 이 0 이 아닌 경우가 많다 — gap 만으로 판정.
   * Android overlay: innerHeight 는 그대로이고 vv.height 만 줄어든다.
   */
  return rounded;
}

export function resolveChatViewportShellClassNames(opts: {
  layoutMode: ChatViewportShellLayoutMode;
  platform: ChatViewportShellPlatform;
}): string {
  const { layoutMode, platform } = opts;
  const parts = ["chat-viewport-shell"];
  if (layoutMode === "embedded") parts.push("chat-viewport-shell--embedded");
  else if (layoutMode === "narrow") parts.push("chat-viewport-shell--narrow");
  parts.push(`chat-viewport-shell--${platform}`);
  return parts.join(" ");
}
