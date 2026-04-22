/**
 * iPhone·iPad **Safari / WKWebView**(인앱) 등 WebKit 계열.
 * iOS 크롬(CriOS)·파이어폭스(FxiOS) 등은 WebKit이지만 엔진 분기가 다를 수 있어 제외하지 않음 — 필요 시 좁힐 것.
 */
export function isLikelyIosWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOs13Plus = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const iosDevice = /iPad|iPhone|iPod/.test(ua) || iPadOs13Plus;
  if (!iosDevice) return false;
  return true;
}
