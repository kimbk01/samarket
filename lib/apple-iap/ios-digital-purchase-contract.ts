/**
 * iOS 앱 안 디지털 결제(사장님 Cash 광고 결제·Cash 충전 요청) 차단 계약 — 클라이언트·서버 공용.
 *
 * Cash 는 Apple IAP 로 팔지 않으므로 iOS 앱에서는 Cash 로 앱 내 광고를 사거나 Cash 를 충전하지 않는다
 * (App Review Guidelines 3.1.1 · 3.1.3). Android·웹은 그대로.
 *
 * 판별 신호는 「차단」에만 쓴다 (결제 권한 부여에 쓰지 않음 · 권한은 기존 세션·매장 소유 검사).
 * 신호 하나라도 iOS 앱이면 차단 — 쿠키가 지워지거나 헤더가 빠져도 나머지 신호로 막는다.
 */

export const IOS_DIGITAL_PURCHASE_UNAVAILABLE = "ios_digital_purchase_unavailable" as const;

/** 앱 런타임(Capacitor)이 판별한 셸 — `ios` | `android` | `web` */
export const DIBAY_SHELL_HEADER = "x-dibay-shell" as const;

export type IosAppRequestSignal = "header" | "cookie" | "user_agent";

const APPLE_WEBKIT = /AppleWebKit\//;
const APPLE_DEVICE = /\b(iPhone|iPad|iPod|Macintosh)\b/;
/** 브라우저(Safari·Chrome·Firefox·Edge·Opera)는 UA 에 브라우저 토큰이 있다 — 앱 WKWebView 기본 UA 에는 없다 */
const BROWSER_TOKEN = /\b(Safari|CriOS|FxiOS|EdgiOS|OPiOS|OPT|Chrome|Firefox)\//;
/** 다른 앱의 인앱 브라우저 (웹 사용자) — 차단 대상 아님 */
const THIRD_PARTY_IN_APP =
  /(FBAN|FBAV|FB_IAB|Instagram|\bLine\/|KAKAOTALK|NAVER\(|DaumApps|Twitter|LinkedInApp|Snapchat|musical_ly|BytedanceWebview|TikTok|GSA\/|Pinterest|WhatsApp|Viber)/i;

/** DIBAY iOS 앱 WKWebView 기본 UA (iPhone·iPad 데스크톱 모드) — Capacitor 설정은 UA 를 바꾸지 않는다 */
export function isIosAppWebViewUserAgent(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? "");
  if (!ua || !APPLE_WEBKIT.test(ua) || !APPLE_DEVICE.test(ua)) return false;
  if (BROWSER_TOKEN.test(ua) || THIRD_PARTY_IN_APP.test(ua)) return false;
  return true;
}

export function detectIosAppRequestSignals(input: {
  shellHeader?: string | null;
  markerCookie?: string | null;
  userAgent?: string | null;
}): IosAppRequestSignal[] {
  const signals: IosAppRequestSignal[] = [];
  if (String(input.shellHeader ?? "").trim().toLowerCase() === "ios") signals.push("header");
  if (String(input.markerCookie ?? "").trim().toLowerCase() === "ios") signals.push("cookie");
  if (isIosAppWebViewUserAgent(input.userAgent)) signals.push("user_agent");
  return signals;
}
