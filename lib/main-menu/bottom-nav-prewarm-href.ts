import type { UserRegion } from "@/lib/regions/types";
import { storeHomeFeedRegionOnlySuffix } from "@/lib/stores/stores-home-feed-query-gate";
import { prewarmBottomNavTapTargetClientCache } from "@/lib/main-menu/bottom-nav-tap-prewarm-data";

/** BN3 Stores `pointerdown` 과 동일한 home-feed 쿼리 접미 — idle·부트·세그먼트 탭 부트웜 과 공유.
 * Region-only key (Phase 4) — district must not split the client cache. */
export function storeHomeFeedSuffixFromUserPrimaryRegion(primaryRegion: UserRegion | null): string {
  return storeHomeFeedRegionOnlySuffix(primaryRegion);
}

/** `/stores` 일 때만 region suffix 를 넘겨 BN3·idle·부트 prewarm 키를 맞춘다 */
export function prewarmBottomNavTapHrefResolvingStoresRegion(
  href: string,
  primaryRegion: UserRegion | null
): void {
  const pathOnly = (href.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  if (pathOnly === "/stores") {
    const suffix = storeHomeFeedSuffixFromUserPrimaryRegion(primaryRegion);
    prewarmBottomNavTapTargetClientCache(href, {
      storeHomeFeedSuffixes: suffix ? [suffix] : [],
      clientCallSource: "bottom_nav_prewarm",
    });
    return;
  }
  prewarmBottomNavTapTargetClientCache(href);
}
