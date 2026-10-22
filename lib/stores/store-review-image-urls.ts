/**
 * IMG-04a — 매장 리뷰 `image_urls` 는 이 구매자·이 주문의 리뷰 업로드 경로만 허용.
 * 업로드 SSOT: `POST /api/me/store-reviews/upload-image` →
 * `post-images/{buyerId}/store-reviews/{orderId}/{uuid}.webp` (`post-images-storage-ownership.ts` 등록 경로).
 * 외부 호스트·다른 구매자·다른 주문·다른 버킷 URL 은 공개 매장 화면에 노출되므로 거절한다.
 */
import { POST_IMAGES_BUCKET } from "@/lib/media/canonical-image-contract";
import { parseSupabasePublicObjectUrl } from "@/lib/media/canonical-image-path";

export const STORE_REVIEW_IMAGE_MAX = 3;
const URL_MAX_LEN = 2048;

export type ParseStoreReviewImageUrlsResult =
  | { ok: true; urls: string[] }
  | { ok: false; error: "invalid_image_urls" };

function supabaseOrigin(supabaseUrl: string | null | undefined): string | null {
  try {
    return supabaseUrl ? new URL(supabaseUrl).origin : null;
  } catch {
    return null;
  }
}

export function isOwnStoreReviewImageUrl(
  url: string,
  ctx: { buyerId: string; orderId: string; supabaseUrl: string | null | undefined }
): boolean {
  const s = url.trim();
  if (!s || s.length > URL_MAX_LEN) return false;
  const origin = supabaseOrigin(ctx.supabaseUrl);
  if (!origin) return false;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  if (u.origin !== origin || u.search || u.hash) return false;
  if (!u.pathname.startsWith(`/storage/v1/object/public/${POST_IMAGES_BUCKET}/`)) return false;
  const parsed = parseSupabasePublicObjectUrl(s);
  if (!parsed || parsed.bucket !== POST_IMAGES_BUCKET) return false;
  const path = parsed.path;
  if (path.includes("..") || path.includes("%") || path.includes("\\")) return false;
  const buyerId = ctx.buyerId.trim();
  const orderId = ctx.orderId.trim();
  if (!buyerId || !orderId) return false;
  return path.startsWith(`${buyerId}/store-reviews/${orderId}/`);
}

/** 배열이 아니면 이미지 없음. 하나라도 자기 업로드 경로가 아니면 거절(조용히 버리지 않음). */
export function parseStoreReviewImageUrls(
  raw: unknown,
  ctx: { buyerId: string; orderId: string; supabaseUrl: string | null | undefined }
): ParseStoreReviewImageUrlsResult {
  if (!Array.isArray(raw)) return { ok: true, urls: [] };
  const urls: string[] = [];
  for (const x of raw) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (!isOwnStoreReviewImageUrl(s, ctx)) return { ok: false, error: "invalid_image_urls" };
    if (!urls.includes(s)) urls.push(s);
    if (urls.length >= STORE_REVIEW_IMAGE_MAX) break;
  }
  return { ok: true, urls };
}
