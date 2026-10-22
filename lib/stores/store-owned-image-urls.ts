import { STORE_PRODUCT_IMAGES_BUCKET } from "@/lib/media/canonical-image-contract";
import { parseSupabasePublicObjectUrl } from "@/lib/media/canonical-image-path";

/**
 * 오너 이미지 정리(삭제) 대상 필터 — 이 매장 업로드 폴더(`store-product-images/{storeId}/…`) 원본만 남긴다.
 * 다른 매장·커뮤니티(`post-images`)·외부 URL 은 오너 저장값에 들어 있어도 절대 지우지 않는다 (감사 P0-4 / PRD-01).
 * 업로드 경로 SSOT: `app/api/me/stores/[storeId]/upload-image/route.ts` (`${sid}/${uuid}.${ext}`,
 * IMG-01 이후 신규는 `${sid}/${uuid}.l1.${ext}` + `.hero.webp`·`.feed.webp` 파생본).
 */
export function isStoreOwnedImageStoragePath(storeId: string, path: string): boolean {
  const sid = storeId.trim();
  if (!sid || !path) return false;
  if (path.includes("..") || path.includes("%") || path.includes("\\")) return false;
  return path.startsWith(`${sid}/`);
}

export function filterStoreOwnedImageUrls(
  storeId: string,
  urls: Iterable<string | null | undefined>
): string[] {
  const out: string[] = [];
  for (const url of urls) {
    if (typeof url !== "string" || !url.trim()) continue;
    const parsed = parseSupabasePublicObjectUrl(url);
    if (!parsed || parsed.bucket !== STORE_PRODUCT_IMAGES_BUCKET) continue;
    if (!isStoreOwnedImageStoragePath(storeId, parsed.path)) continue;
    out.push(url);
  }
  return out;
}
