/**
 * 실기 FAIL-2 바로잡은 설계 F2′ (Owner 「수정 설계 승인」 2026-11-17 ·
 * docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md §6):
 * Android 앱이 이번 실행에 시스템 시작 화면과 같은 모습의 **앱 안 덮개**를 WebView 위에 두었는지.
 * 네이티브가 문서 시작 스크립트로 `window.__DIBAY_NATIVE_SPLASH_COVER__ = "1"` 을 넣는다(빌드 69~).
 * - 덮개 있음: WebView 가 덮개 아래에서 첫 그리기를 끝내므로 해제는 첫 목적지 화면 준비(hydration 뒤) 하나.
 * - 덮개 없음(빌드 68 이하·iOS·알림/통화로 켠 실행): P3(서버 본문 첫 그림 해제)를 쓴다.
 */
declare global {
  interface Window {
    __DIBAY_NATIVE_SPLASH_COVER__?: string;
  }
}

export function isNativeSplashCoverActive(): boolean {
  return typeof window !== "undefined" && window.__DIBAY_NATIVE_SPLASH_COVER__ === "1";
}
