import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";

/** 상세 갤러리(images_json) 최대 장수 — 대표(thumbnail_url)와 분리 */
export const OWNER_PRODUCT_DETAIL_IMAGE_MAX = 5;

/** 한 화면에서 등록 가능한 이미지 총장(대표 포함) — 대표 1 + 상세 5 */
export const OWNER_PRODUCT_IMAGE_SLOTS_MAX = OWNER_PRODUCT_DETAIL_IMAGE_MAX + 1;

/** `http://IP:port` 등 비보안 컨텍스트에서도 동작하는 클라이언트 전용 id (randomUUID 미지원 대비) */
export function newOwnerProductImageSlotId(): string {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === "function") {
      return c.randomUUID();
    }
  } catch {
    /* noop */
  }
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** 매장 상품 이미지 업로드 상한(바이트) — 오너 폼·upload-image·서버 검증과 동일하게 유지 */
export const OWNER_PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** 오너 폼「이미지 추가」버튼에 표시하는 권장 문구(전체 문자열) */
export const OWNER_PRODUCT_IMAGE_ADD_BUTTON_LABEL = "이미지 추가 ( 권장512 X 512 10MB이하)";

export const OWNER_PRODUCT_IMAGE_ALLOWED_MIMES = new Set(["image/jpeg", "image/webp"]);

function normalizeUrl(u: string): string {
  return u.trim();
}

export type NormalizeProductDetailImagesResult =
  | { ok: true; urls: string[] }
  | { ok: false; error: string; message?: string };

/**
 * 오너/관리자 API용: 상세 이미지 URL 배열 정규화.
 * - thumbnail_url 과 동일한 URL은 상세에 둘 수 없음(대표 중복 금지).
 */
export function normalizeOwnerProductDetailImageUrls(
  raw: unknown,
  thumbnailUrl: string | null | undefined,
  max = OWNER_PRODUCT_DETAIL_IMAGE_MAX
): NormalizeProductDetailImagesResult {
  const thumb = thumbnailUrl != null && String(thumbnailUrl).trim() ? normalizeUrl(String(thumbnailUrl)) : "";
  const parsed = parseMediaUrlsJson(raw, max + 5);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of parsed) {
    const n = normalizeUrl(u);
    if (!n || seen.has(n)) continue;
    if (thumb && n === thumb) {
      return {
        ok: false,
        error: "detail_image_overlaps_thumbnail",
        message: "상세 이미지에 대표 이미지와 같은 파일을 넣을 수 없습니다.",
      };
    }
    seen.add(n);
    out.push(n);
    if (out.length >= max) break;
  }
  return { ok: true, urls: out };
}

export type ThumbnailDimensions = { width: number; height: number };

function dimOk(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 8192 && Math.floor(n) === n;
}

export function parseThumbnailDimensions(
  width: unknown,
  height: unknown
): { ok: true; dims: ThumbnailDimensions | null } | { ok: false; error: string } {
  if (width === undefined && height === undefined) {
    return { ok: true, dims: null };
  }
  if (width == null && height == null) {
    return { ok: true, dims: null };
  }
  if (!dimOk(width) || !dimOk(height)) {
    return { ok: false, error: "invalid_thumbnail_dimensions" };
  }
  return { ok: true, dims: { width: width as number, height: height as number } };
}

export function validateOwnerProductImageFileForUpload(file: File): { ok: true } | { ok: false; message: string } {
  if (!file || !(file instanceof File)) {
    return { ok: false, message: "이미지 파일을 선택해 주세요." };
  }
  if (file.size > OWNER_PRODUCT_IMAGE_MAX_BYTES) {
    return { ok: false, message: "이미지는 10MB 이하여야 합니다." };
  }
  const mime = (file.type || "").toLowerCase();
  if (!OWNER_PRODUCT_IMAGE_ALLOWED_MIMES.has(mime)) {
    return { ok: false, message: "이미지는 JPG 또는 WebP만 사용할 수 있습니다." };
  }
  return { ok: true };
}
