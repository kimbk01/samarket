import { HomeScreen } from "@/components/home-hub/HomeScreen";
import { loadHomeLayoutServerCached } from "@/lib/home/load-home-layout-server";
import { loadHomeCatalogServerCached } from "@/lib/home/load-home-catalog-server";
import { HomeAboveFoldImagePreload } from "@/components/home-hub/HomeAboveFoldImagePreload";
import { resolveHomeAboveFoldBannerImageUrls } from "@/lib/home/home-above-fold-preload";
import { SERVER_BODY_FRAME_MARK_SCRIPT } from "@/lib/startup/server-body-frame-mark";

/**
 * 앱 홈 단일 권한 — `/` · `/home` (Owner 「이대로 구현」 2026-11-09, 홈 시안 v22).
 * CONTRACT: HTTP redirect 금지 (Cold Boot Shell-First) — 서버에서 바로 그린다.
 * 홈 구성 = 어드민 「홈 구성」 저장값(서버 캐시, 저장 시 무효화). 실패하면 코드 기본값.
 */
export async function HomeSurface() {
  const [{ config }, catalog] = await Promise.all([loadHomeLayoutServerCached(), loadHomeCatalogServerCached()]);
  return (
    <>
      {/* 앱 진입 실기 F3-b — 첫 화면 배너 그림 미리 받기 (서버 HTML) */}
      <HomeAboveFoldImagePreload urls={resolveHomeAboveFoldBannerImageUrls(config)} />
      <HomeScreen initialLayout={config} initialCatalog={catalog} />
      {/* 설계 H1 — 서버 본문 뒤: 본문이 렌더러 프레임에 들어간 표시(Android 71~ 앱만 · hydration 스크립트보다 먼저) */}
      <script dangerouslySetInnerHTML={{ __html: SERVER_BODY_FRAME_MARK_SCRIPT }} />
    </>
  );
}
