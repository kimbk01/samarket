import type { MetadataRoute } from "next";

/**
 * 설치형 PWA(홈 화면 추가) — Android Chrome·일부 iOS Safari.
 * Web Push는 `public/sw.js` + VAPID + `WEB_PUSH_ENABLED=1` 로 발송 (`/api/me/push/*`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "dibaY",
    short_name: "dibaY",
    description: "필리핀 거주 한국인을 위한 중고거래·커뮤니티·스토어·메신저",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#FFFCFC",
    theme_color: "#0B421A",
    lang: "ko",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
