import {
  DIBAY_APP_ICON_180_PATH,
  DIBAY_APP_ICON_512_PATH,
  dibayBrandAssetUrl,
} from "@/lib/brand/brand-asset-paths";

/**
 * 설치형 PWA 매니페스트 값 단일 정의 — `app/manifest.ts` 가 그대로 반환한다.
 * 이 파일은 `next` 를 import 하지 않는다: 테스트가 `next` 전역 타입(NODE_ENV 필수)을
 * 끌어오면 `typecheck:test` 의 다른 테스트 env 객체가 오류가 된다 (2026-11-07 CI 실패 원인).
 * Web Push는 `public/sw.js` + VAPID + `WEB_PUSH_ENABLED=1` 로 발송 (`/api/me/push/*`).
 */
export function buildDibayWebAppManifest() {
  return {
    name: "dibaY",
    short_name: "dibaY",
    /**
     * 앱 식별자 고정 — Microsoft Store(PWABuilder)·Edge·Chrome 설치 앱의 정체성.
     * 값이 없으면 브라우저가 start_url 로 계산하므로 같은 값("/")을 명시해 기존 설치에 영향이 없다.
     * 한 번 출시한 뒤에는 바꾸지 않는다 (바꾸면 다른 앱으로 인식된다).
     */
    id: "/",
    description: "필리핀 거주 한국인을 위한 중고거래·커뮤니티·스토어·메신저",
    start_url: "/",
    scope: "/",
    display: "standalone" as const,
    orientation: "any" as const,
    background_color: "#FFFCFC",
    theme_color: "#0B421A",
    lang: "ko",
    icons: [
      {
        src: dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH),
        sizes: "512x512",
        type: "image/png",
        purpose: "any" as const,
      },
      {
        src: dibayBrandAssetUrl(DIBAY_APP_ICON_180_PATH),
        sizes: "180x180",
        type: "image/png",
        purpose: "any" as const,
      },
    ],
  };
}
