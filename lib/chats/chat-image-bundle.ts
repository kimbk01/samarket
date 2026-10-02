/** 한 메시지에 묶는 채팅 이미지 — product_chat_messages.content JSON (통합 chat_messages는 metadata.imageUrls) */

export const MAX_CHAT_IMAGE_ATTACH = 10;

function getAllowedChatImagePrefixes(): string[] {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return [];
  return [`${base}/storage/v1/object/public/`];
}

/** 사용자가 채팅에 첨부할 수 있는 공개 버킷 — 채팅 이미지는 post-images 만. */
const ALLOWED_CHAT_IMAGE_BUCKETS = new Set(["post-images"]);
const CHAT_IMAGE_FILENAME = /\.(png|jpe?g|gif|webp|heic|heif)$/i;

/**
 * SEC-08: 공개 스토리지 접두어만 보던 느슨한 검사를 강화한다.
 * - origin 은 Supabase 공개 스토리지로 고정(접두어 일치)
 * - query/fragment 금지, `..` 경로 탐색 금지
 * - 버킷은 post-images 로 제한, 이미지 확장자만
 * - ownerUid 가 주어지면 post-images/<ownerUid>/ 로 소유 경로까지 제한(타인 경로 사칭 차단)
 */
function isAllowedIncomingChatImageUrl(raw: string, ownerUid?: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.search || parsed.hash) return false;
  if (value.includes("..")) return false;
  const allowPrefixes = getAllowedChatImagePrefixes();
  const matched = allowPrefixes.find((prefix) => value.startsWith(prefix));
  if (!matched) return false;
  const objectPath = value.slice(matched.length);
  const firstSeg = objectPath.split("/")[0] ?? "";
  if (!ALLOWED_CHAT_IMAGE_BUCKETS.has(firstSeg)) return false;
  if (!CHAT_IMAGE_FILENAME.test(objectPath)) return false;
  if (ownerUid) {
    const uid = ownerUid.trim();
    if (!uid || !objectPath.startsWith(`post-images/${uid}/`)) return false;
  }
  return true;
}

export type ProductChatImageBundlePayload = {
  bundle: true;
  urls: string[];
  caption?: string;
};

export function buildProductChatImageContent(urls: string[], caption: string): string {
  const clean = urls.map((u) => u.trim()).filter(Boolean);
  if (clean.length <= 1) return caption;
  const payload: ProductChatImageBundlePayload = {
    bundle: true,
    urls: clean,
    ...(caption.trim() ? { caption: caption.trim() } : {}),
  };
  return JSON.stringify(payload);
}

export function parseProductChatImageContent(
  content: string | null | undefined,
  imageUrl: string | null | undefined
): { urls: string[]; caption: string } {
  const trimmed = (content ?? "").trim();
  if (trimmed.startsWith("{")) {
    try {
      const o = JSON.parse(trimmed) as Partial<ProductChatImageBundlePayload>;
      if (o.bundle === true && Array.isArray(o.urls) && o.urls.length > 0) {
        const urls = o.urls
          .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
          .map((u) => u.trim());
        if (urls.length) {
          return {
            urls,
            caption: typeof o.caption === "string" ? o.caption : "",
          };
        }
      }
    } catch {
      /* 본문이 일반 캡션 */
    }
  }
  const one = (imageUrl ?? "").trim();
  return { urls: one ? [one] : [], caption: trimmed };
}

export function normalizeIncomingImageUrlList(input: {
  imageUrl?: unknown;
  imageUrls?: unknown;
  /** SEC-08: 주어지면 post-images/<ownerUid>/ 경로만 허용 (발신자 본인 업로드만). */
  ownerUid?: string;
}): string[] {
  const out: string[] = [];
  const ownerUid = typeof input.ownerUid === "string" ? input.ownerUid : undefined;
  if (Array.isArray(input.imageUrls)) {
    for (const u of input.imageUrls) {
      if (typeof u === "string" && isAllowedIncomingChatImageUrl(u, ownerUid)) out.push(u.trim());
    }
  }
  const single =
    typeof input.imageUrl === "string" && isAllowedIncomingChatImageUrl(input.imageUrl, ownerUid)
      ? input.imageUrl.trim()
      : "";
  if (single) out.push(single);
  const dedup = [...new Set(out)];
  return dedup.slice(0, MAX_CHAT_IMAGE_ATTACH);
}
