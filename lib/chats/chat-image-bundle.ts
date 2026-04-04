/** 한 메시지에 묶는 채팅 이미지 — product_chat_messages.content JSON (통합 chat_messages는 metadata.imageUrls) */

export const MAX_CHAT_IMAGE_ATTACH = 10;

function getAllowedChatImagePrefixes(): string[] {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return [];
  return [`${base}/storage/v1/object/public/`];
}

function isAllowedIncomingChatImageUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  const allowPrefixes = getAllowedChatImagePrefixes();
  return allowPrefixes.some((prefix) => value.startsWith(prefix));
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
}): string[] {
  const out: string[] = [];
  if (Array.isArray(input.imageUrls)) {
    for (const u of input.imageUrls) {
      if (typeof u === "string" && isAllowedIncomingChatImageUrl(u)) out.push(u.trim());
    }
  }
  const single =
    typeof input.imageUrl === "string" && isAllowedIncomingChatImageUrl(input.imageUrl)
      ? input.imageUrl.trim()
      : "";
  if (single) out.push(single);
  const dedup = [...new Set(out)];
  return dedup.slice(0, MAX_CHAT_IMAGE_ATTACH);
}
