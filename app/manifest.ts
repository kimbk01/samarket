import type { MetadataRoute } from "next";
import { buildDibayWebAppManifest } from "@/lib/pwa/dibay-web-app-manifest";

/**
 * 설치형 PWA(홈 화면 추가·Microsoft Store PWABuilder) — 값은 `lib/pwa/dibay-web-app-manifest.ts` 단일 정의.
 */
export default function manifest(): MetadataRoute.Manifest {
  return buildDibayWebAppManifest();
}
