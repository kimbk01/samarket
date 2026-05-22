import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";
import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";

/** 상품 공개 페이지·옵션 시트·카트 라인 — 동일 대표 이미지 URL */
export function resolveStoreProductPrimaryImageUrl(
  thumbnailUrl: string | null | undefined,
  imagesJson: unknown
): string {
  const thumb = resolveStoreProductMediaUrl(thumbnailUrl) ?? "";
  if (thumb) return thumb;
  for (const raw of parseMediaUrlsJson(imagesJson, 12)) {
    const u = resolveStoreProductMediaUrl(raw) ?? raw.trim();
    if (u) return u;
  }
  return "";
}

/** 히어로 + 하단 썸네일 스트립(대표 이미지 선두, 중복 제거) */
export function buildStoreProductGalleryUrls(
  thumbnailUrl: string | null | undefined,
  imagesJson: unknown,
  max = 12
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    const u = resolveStoreProductMediaUrl(raw) ?? (typeof raw === "string" ? raw.trim() : "");
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  push(thumbnailUrl);
  for (const raw of parseMediaUrlsJson(imagesJson, max)) {
    push(raw);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}
