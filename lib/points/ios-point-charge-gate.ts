/**
 * D-07 (광고 3차 재감사 · 2026-11-07): iOS 앱 포인트 충전 화면 판정 — 서버 차단(`blockIosAppDigitalPurchase`)과 같은 신호.
 *
 * 서버는 셸 헤더·`dibay_app` 쿠키·앱 WKWebView UA 중 하나라도 iOS 앱이면 계좌 충전 요청을 403
 * `ios_digital_purchase_unavailable` 로 막는다. 화면이 StoreKit 유무만 보면 구 빌드(StoreKit 없음 · 22 이하)에서
 * 막힌 계좌 폼을 보여 준다. 그래서 화면도 같은 함수(`detectIosAppRequestSignals`)로 iOS 앱을 판정하고,
 * StoreKit 이 없으면 계좌 폼 대신 「앱 업데이트」 안내를 보인다.
 */
import {
  IOS_DIGITAL_PURCHASE_UNAVAILABLE,
  detectIosAppRequestSignals,
} from "@/lib/apple-iap/ios-digital-purchase-contract";
import { DIBAY_APP_MARKER_COOKIE_NAME } from "@/lib/platform/capacitor-native";

export type PointChargeMode = "apple" | "ios_update_required" | "bank";

/** 서버와 같은 신호로 iOS 앱 여부 (셸 = Capacitor 판별 결과 · 쿠키 = dibay_app 값 · UA) */
export function isIosAppPointChargeClient(input: {
  shell?: string | null;
  markerCookie?: string | null;
  userAgent?: string | null;
}): boolean {
  return (
    detectIosAppRequestSignals({
      shellHeader: input.shell,
      markerCookie: input.markerCookie,
      userAgent: input.userAgent,
    }).length > 0
  );
}

/** StoreKit 이 있으면 Apple 결제 · iOS 앱인데 없으면 업데이트 안내 · 그 밖(Android·웹)은 계좌 충전 */
export function resolvePointChargeMode(input: { iosApp: boolean; storeKitAvailable: boolean }): PointChargeMode {
  if (input.storeKitAvailable) return "apple";
  if (input.iosApp) return "ios_update_required";
  return "bank";
}

/** 계좌 충전 응답이 「iOS 앱이라 막힘」인지 */
export function isIosPointChargeBlockedResponse(status: number, error: string | null | undefined): boolean {
  return status === 403 && String(error ?? "") === IOS_DIGITAL_PURCHASE_UNAVAILABLE;
}

/** 브라우저의 `dibay_app` 쿠키 값 (없으면 null) */
export function readDibayAppMarkerCookie(cookie: string | null | undefined): string | null {
  for (const part of String(cookie ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === DIBAY_APP_MARKER_COOKIE_NAME) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=");
      }
    }
  }
  return null;
}

/** 업데이트 안내에서 여는 화면 — 설치 버전·스토어 「지금 업데이트」 버튼이 있는 기존 화면 */
export const POINT_CHARGE_APP_UPDATE_HREF = "/mypage/app-updates";
