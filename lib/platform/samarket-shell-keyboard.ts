/**
 * SAMarket **네이티브 앱·Capacitor·커스텀 WebView**가 웹 레이어에 키보드 가림 높이를 알려 줄 때의 계약.
 *
 * 브라우저(Safari/Chrome)만 쓸 때는 `window.samarketShell` 을 두지 않으면 되며, 기존처럼
 * `visualViewport` + `useMobileKeyboardInset` 이 동작한다.
 *
 * ## 네이티브 쪽 구현 요약
 *
 * 1. 키보드가 올라오면 **레이아웃 기준 CSS px** 로 하단이 가려지는 높이를 계산한다.
 *    (Android: `WindowInsets` / iOS: 키보드 프레임을 webView 높이 대비 변환 — 플랫폼 SDK 문서 따름.)
 * 2. `window.samarketShell.keyboardBottomInsetCssPx = <number>` 에 대입한 뒤,
 *    `window.dispatchEvent(new CustomEvent(SAMARKET_SHELL_KEYBOARD_EVENT))` 로 웹에 알린다.
 * 3. 키보드가 내려가면 `keyboardBottomInsetCssPx = 0` 과 동일하게 이벤트를 다시 보낸다.
 *
 * 선택: 실시간 폴링이 어렵다면 `getKeyboardBottomInsetCssPx()` 만 구현해도 된다.
 *
 * @see capacitor.config.ts — Capacitor WebView 로 같은 웹 번들 로드 시 이 계약을 그대로 사용 가능.
 */

export const SAMARKET_SHELL_KEYBOARD_EVENT = "samarket:shell-keyboard" as const;

export type SamarketShellKeyboardDetail = {
  bottomInsetCssPx: number;
};

declare global {
  interface Window {
    /**
     * 네이티브 래퍼가 선택적으로 주입. 없으면 전부 브라우저 측정 경로.
     */
    samarketShell?: {
      /**
       * 키보드·시스템 UI 등으로 **레이아웃 뷰포트 하단**이 가려지는 높이(CSS px). 없으면 미사용.
       * `0` = 가림 없음.
       */
      keyboardBottomInsetCssPx?: number;
      /** `keyboardBottomInsetCssPx` 대신 매번 읽기 (Capacitor 플러그인 래핑 등) */
      getKeyboardBottomInsetCssPx?: () => number;
    };
  }
}

/** 네이티브가 키보드 inset 을 제공 중이면 `0` 이상의 정수, 미사용이면 `null` */
export function readSamarketShellKeyboardBottomInsetCssPx(): number | null {
  if (typeof window === "undefined") return null;
  const sh = window.samarketShell;
  if (!sh) return null;
  if (typeof sh.getKeyboardBottomInsetCssPx === "function") {
    try {
      const v = sh.getKeyboardBottomInsetCssPx();
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
    } catch {
      return null;
    }
    return null;
  }
  if (typeof sh.keyboardBottomInsetCssPx === "number" && Number.isFinite(sh.keyboardBottomInsetCssPx)) {
    return Math.max(0, Math.round(sh.keyboardBottomInsetCssPx));
  }
  return null;
}

export function subscribeSamarketShellKeyboardInsets(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener(SAMARKET_SHELL_KEYBOARD_EVENT, handler);
  return () => window.removeEventListener(SAMARKET_SHELL_KEYBOARD_EVENT, handler);
}
