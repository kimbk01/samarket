import type { UserRegion } from "@/lib/regions/types";
import { getRegionName } from "@/lib/regions/region-utils";
import { prewarmBottomNavTapTargetClientCache } from "@/lib/main-menu/bottom-nav-tap-prewarm-data";

/** BN3 Stores `pointerdown` 과 동일한 home-feed 쿼리 접미 — idle·부트·세그먼트 탭 부트웜 과 공유 */
export function storeHomeFeedSuffixFromUserPrimaryRegion(primaryRegion: UserRegion | null): string {
  const r = primaryRegion?.regionId ? getRegionName(primaryRegion.regionId).trim() : "";
  const d = primaryRegion?.barangay?.trim() ?? "";
  const q = new URLSearchParams();
  if (r) q.set("region", r);
  if (d) q.set("district", d);
  const s = q.toString();
  return s ? `?${s}` : "";
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
