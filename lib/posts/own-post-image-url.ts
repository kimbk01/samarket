/**
 * 거래 글 이미지 = 자사 Storage `post-images/{작성자 id}/…` 만 저장 (TM-22).
 * 업로드 API(`/api/posts/upload-image`)는 항상 `{uid}/…` 경로에 올린다 — 외부 호스트·타인 폴더 URL 은 저장하지 않는다.
 * Supabase URL 환경변수가 없으면(로컬 오프라인 등) 판정하지 않고 통과시킨다.
 */
const PUBLIC_OBJECT_PREFIXES = [
  "/storage/v1/object/public/post-images/",
  "/storage/v1/render/image/public/post-images/",
] as const;

function supabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function isOwnPostImageUrl(url: string, userId: string, origin: string | null = supabaseOrigin()): boolean {
  if (!origin) return true;
  const uid = String(userId ?? "").trim();
  if (!uid) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.origin !== origin) return false;
  return PUBLIC_OBJECT_PREFIXES.some((p) => parsed.pathname.startsWith(`${p}${uid}/`));
}

export function filterOwnPostImageUrls(
  urls: readonly string[] | null | undefined,
  userId: string,
  origin: string | null = supabaseOrigin()
): string[] | null | undefined {
  if (urls == null) return urls;
  return urls.filter((u) => typeof u === "string" && isOwnPostImageUrl(u, userId, origin));
}

/** P-4 (I11): 거래 글 사진 최대 장수 — 작성 화면(ImageUploader maxCount)·서버(create·owner-trade-update) 공통 */
export const TRADE_POST_MAX_IMAGES = 10;
