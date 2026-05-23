/**
 * 메인 앱 셸 스크롤 — 단일 API (`main-shell-viewport.ts` 와 쌍).
 *
 * - 헤더: `AppStickyHeader` → `MainHubScrollColumn` 헤더 슬롯(고정)
 * - 본문: `ConditionalAppShell` `<main>` (`MAIN_COLUMN_SCROLL_CLASS`)
 * - 레거시: 채팅 상세·카트·오너 운영 등은 `<main>` 이 잠기고 내부/문서 스크롤
 */

export {
  getStoreDetailAppScrollRoot as getMainAppScrollRoot,
  getStoreDetailAppScrollRootCached as getMainAppScrollRootCached,
  getStoreDetailScrollTop as getMainAppScrollTop,
  setStoreDetailScrollTop as setMainAppScrollTop,
  measureStoreDetailElementScrollTop as measureMainAppElementScrollTop,
  invalidateStoreDetailScrollRootCache as invalidateMainAppScrollRootCache,
  isDocumentScrollRoot,
} from "@/lib/ui/store-detail-scroll-root";

export { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
