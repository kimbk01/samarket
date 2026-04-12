import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 네이티브 앱 래퍼 (선택).
 * - `server.url` 이 있으면 WebView가 해당 HTTPS URL을 로드 (프로덕션 사이트와 동일).
 * - 로컬 개발: `CAPACITOR_SERVER_URL=http://192.168.x.x:3000` + Android `android:usesCleartextTraffic` 등 별도 설정.
 *
 * 사용: `npm install` 후 `npx cap add android` / `npx cap add ios`, `npm run cap:sync`
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";

const config: CapacitorConfig = {
  appId: "io.samarket.app",
  appName: "SAMarket",
  webDir: "capacitor-www",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl.replace(/\/$/, ""),
          cleartext: serverUrl.startsWith("http://"),
        },
      }
    : {}),
};

export default config;
