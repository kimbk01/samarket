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
import { CHAT_SHELL_KEYBOARD_OVERLAY_MIN_PX, CHAT_SHELL_NAV_GAP_MAX_PX } from "@/lib/ui/messenger-chat-viewport-tuning";

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
 * IME keyboard height only — nav/home indicator는 `--safe-bottom`(Safe Area P0) 전담.
 * closed → 0. open → native `keyboardBottomInsetCssPx` 또는 visualViewport gap(≥ threshold).
 */
export function resolveChatBottomInsetCssPx(): number {
  return resolveChatShellKeyboardOverlayCssPx();
}

/** @deprecated use resolveChatBottomInsetCssPx — nav gap은 `--safe-bottom` SSOT */
export function resolveChatShellNavigationInsetCssPx(_keyboardOffsetPx: number): number {
  return 0;
}

/** QA probe alias — `resolveChatBottomInsetCssPx` 와 동일 */
export function resolveChatKeyboardBottomCssPx(): number {
  return resolveChatBottomInsetCssPx();
}

/**
 * 셸 padding-bottom `--chat-bottom-active` (px).
 * - keyboard closed → 0 (CSS `var(--safe-bottom)` fallback)
 * - keyboard open + vv 미반영 → keyboard px
 * - keyboard open + vv 이미 반영(resizes-content) → 0 (safe-bottom fallback 금지)
 */
export function resolveChatBottomActiveCssPx(opts: {
  keyboardPx: number;
  layoutHeightPx: number;
  innerHeight: number;
}): number {
  const { keyboardPx, layoutHeightPx, innerHeight } = opts;
  if (keyboardPx <= 0) return 0;
  const vvAlreadyReflectsKeyboard =
    layoutHeightPx > 0 && innerHeight - layoutHeightPx >= keyboardPx - 8;
  if (vvAlreadyReflectsKeyboard) return 0;
  return keyboardPx;
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

  /** Nav/gesture gap(≤120px) — Safe Area `--safe-bottom` 전담, keyboard 아님 */
  if (rounded <= CHAT_SHELL_NAV_GAP_MAX_PX) return 0;

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
