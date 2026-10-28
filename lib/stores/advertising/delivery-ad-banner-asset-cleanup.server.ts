import "server-only";

/**
 * HB-4 — 배달 광고 배너 이미지(`admin-notification-campaign-images` 버킷의 `_admin|_owner/delivery-ads/banner/…`)
 * 정리. 캠페인·크리에이티브 행 삭제 뒤, 아직 어떤 행도 쓰지 않는 파일만 지운다. 같은 버킷의 알림 캠페인 이미지는 건드리지 않는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "admin-notification-campaign-images";
const BANNER_PATH_RE = /^_(admin|owner)\/delivery-ads\/banner\//;

/** 공개 URL 또는 경로 → 버킷 내부 경로 (배달 광고 배너 경로만) */
export function deliveryAdBannerStoragePath(value: string | null | undefined): string | null {
  const t = String(value ?? "").trim();
  if (!t) return null;
  const marker = `/object/public/${BUCKET}/`;
  const i = t.indexOf(marker);
  const path = decodeURIComponent((i >= 0 ? t.slice(i + marker.length) : t).split("?")[0]!);
  return BANNER_PATH_RE.test(path) ? path : null;
}

/** 삭제 전에 호출 — 캠페인과 연결 크리에이티브가 쓰는 배너 파일 경로 */
export async function collectDeliveryAdBannerAssetPaths(
  sb: SupabaseClient<any>,
  campaign: { imageUrl?: string | null; creativeId?: string | null }
): Promise<string[]> {
  const values: (string | null | undefined)[] = [campaign.imageUrl];
  if (campaign.creativeId) {
    const { data } = await sb.from("delivery_ad_creatives").select("asset_path").eq("id", campaign.creativeId).maybeSingle();
    values.push((data as { asset_path?: string | null } | null)?.asset_path);
  }
  return [...new Set(values.map(deliveryAdBannerStoragePath).filter((p): p is string => Boolean(p)))];
}

/** 삭제 후에 호출 — 다른 캠페인·크리에이티브가 아직 쓰면 남긴다. 조회 실패 시 아무것도 지우지 않는다 */
export async function removeUnreferencedDeliveryAdBannerAssets(
  sb: SupabaseClient<any>,
  paths: readonly string[]
): Promise<{ removed: number }> {
  const targets: string[] = [];
  for (const path of paths) {
    const like = `%${path}`;
    const [camp, creative] = await Promise.all([
      sb.from("store_banner_ad_campaigns").select("id", { count: "exact", head: true }).like("image_url", like),
      sb.from("delivery_ad_creatives").select("id", { count: "exact", head: true }).like("asset_path", like),
    ]);
    if (camp.error || creative.error) return { removed: 0 };
    if ((camp.count ?? 0) === 0 && (creative.count ?? 0) === 0) targets.push(path);
  }
  if (targets.length === 0) return { removed: 0 };
  const { error } = await sb.storage.from(BUCKET).remove(targets);
  if (error) {
    console.error("[delivery-ad-banner-asset-cleanup] remove failed", error.message);
    return { removed: 0 };
  }
  return { removed: targets.length };
}
