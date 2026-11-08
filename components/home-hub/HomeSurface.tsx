import { HomeScreen } from "@/components/home-hub/HomeScreen";
import { loadHomeLayoutServerCached } from "@/lib/home/load-home-layout-server";
import { loadHomeCatalogServerCached } from "@/lib/home/load-home-catalog-server";

/**
 * 앱 홈 단일 권한 — `/` · `/home` (Owner 「이대로 구현」 2026-11-09, 홈 시안 v22).
 * CONTRACT: HTTP redirect 금지 (Cold Boot Shell-First) — 서버에서 바로 그린다.
 * 홈 구성 = 어드민 「홈 구성」 저장값(서버 캐시, 저장 시 무효화). 실패하면 코드 기본값.
 */
export async function HomeSurface() {
  const [{ config }, catalog] = await Promise.all([loadHomeLayoutServerCached(), loadHomeCatalogServerCached()]);
  return <HomeScreen initialLayout={config} initialCatalog={catalog} />;
}
