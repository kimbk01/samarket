import type { CapacitorConfig } from "@capacitor/cli";
import {
  normalizeCapacitorServerUrl,
  resolveCapacitorServerUrlFromEnv,
} from "./lib/platform/capacitor-server-url";

/**
 * 네이티브 앱 래퍼 (선택).
 * - `server.url` 이 있으면 WebView가 해당 HTTPS URL을 로드 (프로덕션 사이트와 동일).
 * - Cold Boot: origin `/` 가 `(main)` Philife 홈을 직접 렌더 — `/philife` redirect 없음.
 * - 로컬 개발: `CAPACITOR_SERVER_URL=http://192.168.x.x:3000` + Android `android:usesCleartextTraffic` 등 별도 설정.
 *
 * 사용: `npm install` 후 `npx cap add android` / `npx cap add ios`, `npm run cap:sync:vercel`
 *
 * 키보드·세이프영역: 웹은 `visualViewport` 기반이지만, 앱에서 inset 을 직접 줄 수 있으면
 * `lib/platform/samarket-shell-keyboard.ts` 의 `window.samarketShell` 계약을 구현해 주면
 * 채팅·메신저 레이아웃이 동일 코드로 네이티브 정밀도에 맞춰진다.
 *
 * OAuth Android/iOS 복귀 deep link: `dibay://auth/callback` (AndroidManifest intent-filter).
 * `androidScheme` 은 WebView 내부 scheme 용이며 OAuth deep link 와 별개다.
 *
 * `server.url` 은 origin 만 사용한다 (query 금지).
 * `?dibay_app=android` 를 server.url 에 붙이면 Android Web Message Listener
 * `allowedOriginRules` 가 실제 페이지 origin 과 불일치해 `window.androidBridge` 가 노출되지 않는다.
 * dibay_app marker 는 `ensureCapacitorNativeMarkerOnBoot()` · OAuth navigation query 로 분리한다.
 */
const serverUrl = resolveCapacitorServerUrlFromEnv();

const useLegacyAndroidBridge =
  process.env.CAPACITOR_ANDROID_USE_LEGACY_BRIDGE?.trim() === "1";

/** Option A: bundled Local Runtime owns WebView document (no remote HTML boot). */
const useLocalRuntime = ["1", "true", "on"].includes(
  (process.env.DIBAY_LOCAL_RUNTIME ?? "").trim().toLowerCase()
);

const config: CapacitorConfig = {
  appId: "com.dibay.app",
  appName: "DIBAY",
  webDir: "capacitor-www",
  /**
   * WKWebView root background — app shell bg only (OS_REQUIRED_BOOT_PRIMITIVE).
   * No Intro / System Start product authority (R15 ZERO).
   */
  backgroundColor: "#FFFCFC",
  server: useLocalRuntime
    ? {
        // Document = capacitor-www (Local Runtime). Remote is API-only (see local-runtime markup).
        androidScheme: "https",
        cleartext: false,
      }
    : {
        url: normalizeCapacitorServerUrl(serverUrl),
        cleartext: serverUrl.startsWith("http://"),
      },
  /**
   * iOS 링크 길게 누르기 미리보기(UIContextMenuInteraction) 끔 — 메뉴는 CSS(-webkit-touch-callout)로 막지만
   * 누르는 순간 링크가 떠오르는 효과를 끄기 위해 WKWebView.allowsLinkPreview 를 끈다 (Owner 「1~5번 진행」 2026-11-09).
   * 네이티브 설정 — 다음 iOS 빌드부터 적용.
   */
  ios: {
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      /**
       * Cap SplashScreen = framework bootstrap only.
       * No DIBAY Intro / System Start product authority (R15 ZERO).
       */
      launchAutoHide: true,
      launchShowDuration: 0,
      launchFadeOutDuration: 0,
      backgroundColor: "#FFFCFC",
      androidSplashResourceName: "ic_splash_neutral",
    },
    /**
     * 다크 모드 없음 (Owner 2026-11-13) — 상태 바 아이콘 = 어두운 색 고정. 기본 DEFAULT 는 기기 다크를 따라
     * 흰 아이콘이 되어 밝은 머리글 위에서 안 보인다. 웹(NativeSystemBarsLightBootstrap)이 설치본에도 같은 값을 건다.
     */
    SystemBars: {
      style: "LIGHT",
    },
  },
  ...(useLegacyAndroidBridge
    ? {
        android: {
          useLegacyBridge: true,
        },
      }
    : {}),
};

export default config;
export { normalizeCapacitorServerUrl };
