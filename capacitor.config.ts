import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 네이티브 앱 래퍼 (선택).
 * - `server.url` 이 있으면 WebView가 해당 HTTPS URL을 로드 (프로덕션 사이트와 동일).
 * - 로컬 개발: `CAPACITOR_SERVER_URL=http://192.168.x.x:3000` + Android `android:usesCleartextTraffic` 등 별도 설정.
 *
 * 사용: `npm install` 후 `npx cap add android` / `npx cap add ios`, `npm run cap:sync`
 *
 * 키보드·세이프영역: 웹은 `visualViewport` 기반이지만, 앱에서 inset 을 직접 줄 수 있으면
 * `lib/platform/samarket-shell-keyboard.ts` 의 `window.samarketShell` 계약을 구현해 주면
 * 채팅·메신저 레이아웃이 동일 코드로 네이티브 정밀도에 맞춰진다.
 *
 * OAuth Android/iOS 복귀 deep link: `dibay://auth/callback` (AndroidManifest intent-filter).
 * `androidScheme` 은 WebView 내부 scheme 용이며 OAuth deep link 와 별개다.
 */
const DEFAULT_CAPACITOR_SERVER_URL = "https://samarket.vercel.app";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  DEFAULT_CAPACITOR_SERVER_URL;

function withAndroidAppMarker(url: string): string {
  const trimmed = url.trim().replace(/\/$/, "");
  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.set("dibay_app", "android");
    return parsed.toString().replace(/\/(?=\?)/, "");
  } catch {
    const separator = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${separator}dibay_app=android`;
  }
}

const config: CapacitorConfig = {
  appId: "com.dibay.app",
  appName: "DIBAY",
  webDir: "capacitor-www",
  server: {
    url: withAndroidAppMarker(serverUrl),
    cleartext: serverUrl.startsWith("http://"),
  },
};

export default config;
