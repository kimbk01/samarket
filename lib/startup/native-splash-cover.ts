/**
 * 방식 A (Owner 「방식 A」 2026-11-18 · docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md §14-2):
 * Android 앱이 이번 실행에 시스템 시작 화면과 같은 모습의 **앱 안 덮개**를 WebView 위에 두었는지.
 * 네이티브가 문서 시작 스크립트로 `window.__DIBAY_NATIVE_SPLASH_COVER__ = "1"` 을 넣는다(빌드 72~ · 69·70 에도 있었고 71 에서 빠짐).
 * - 덮개 있음: 해제는 hydration 뒤 첫 목적지 화면 준비 하나 — 보이는 첫 그림이 hydration 뒤 화면(F3 값 포함).
 *   네이티브는 화면 커밋 확인 뒤에 덮개를 걷는다(흰 화면 0).
 * - 덮개 없음(빌드 71 이하 일부·iOS·알림/통화로 켠 실행): P3(서버 본문 첫 그림 해제)를 쓴다.
 */
declare global {
  interface Window {
    __DIBAY_NATIVE_SPLASH_COVER__?: string;
  }
}

export function isNativeSplashCoverActive(): boolean {
  return typeof window !== "undefined" && window.__DIBAY_NATIVE_SPLASH_COVER__ === "1";
}
