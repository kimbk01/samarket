import type { ChatProductSummary } from "@/lib/types/chat";
import { buildPostRegionLabel } from "@/lib/chats/post-region-label";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import { getExchangeFeedLines } from "@/lib/exchange/exchange-feed-lines";
import { hasExchangeMeta } from "@/lib/posts/post-variant";
import { buildPostListPreviewModel } from "@/lib/posts/post-list-preview-model";
import { DEFAULT_APP_SETTINGS } from "@/lib/admin-settings/admin-settings-utils";
import { normalizePostImages } from "@/lib/posts/post-normalize";
import { resolvePostImagePublicUrl } from "@/lib/posts/resolve-post-image-public-url";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parsePostMetaField(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

function imageUrlFromItem(x: unknown): string | null {
  if (typeof x === "string" && x.trim()) return x.trim();
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const o = x as Record<string, unknown>;
    const u = o.url ?? o.image_url ?? o.src;
    if (typeof u === "string" && u.trim()) return u.trim();
    const sp = o.storage_path;
    if (typeof sp === "string" && sp.trim()) return sp.trim();
  }
  return null;
}

function toImages(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const urls: string[] = [];
    for (const x of raw) {
      const u = imageUrlFromItem(x);
      if (u) urls.push(u);
    }
    if (urls.length > 0) return urls;
    const strOnly = raw.filter((x): x is string => typeof x === "string");
    return strOnly.length > 0 ? strOnly : null;
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) {
        const urls: string[] = [];
        for (const x of parsed) {
          const u = imageUrlFromItem(x);
          if (u) urls.push(u);
        }
        if (urls.length > 0) return urls;
        const arr = parsed.filter((x): x is string => typeof x === "string");
        return arr.length > 0 ? arr : null;
      }
    } catch {
      /* ignore */
    }
    if (s.startsWith("{")) {
      return s
        .slice(1, s.indexOf("}"))
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
    return parts.length > 0 ? parts : null;
  }
  return null;
}

function firstImageUrl(row: Record<string, unknown> | undefined): string {
  if (!row) return "";
  const thumb = typeof row.thumbnail_url === "string" ? row.thumbnail_url.trim() : "";
  if (thumb) return resolvePostImagePublicUrl(thumb);

  const normalized = normalizePostImages(row.images);
  if (normalized?.[0]) return resolvePostImagePublicUrl(normalized[0]);

  const imgs = toImages(row.images);
  if (imgs?.[0]) return resolvePostImagePublicUrl(imgs[0]);

  return "";
}

function numPrice(row: Record<string, unknown> | undefined): number {
  if (row?.price == null || row?.price === "") return 0;
  const n = Number(row.price);
  return Number.isNaN(n) ? 0 : n;
}

/** 제목 컬럼이 비었을 때 본문 첫 줄 등으로 보조 */
function displayTitleFromPost(post: Record<string, unknown> | undefined, postId: string): string {
  const t = str(post?.title);
  if (t) return t;
  const c = post?.content ?? post?.description ?? post?.body;
  if (typeof c === "string" && c.trim()) {
    const line = c
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (line) return line.slice(0, 80);
  }
  return postId.length > 6 ? `글 · ${postId.slice(0, 8)}…` : "상품";
}

/**
 * posts 행 → 채팅 목록/방 상단 카드용 요약 (환전은 피드 카드와 동일 필드)
 */
export function chatProductSummaryFromPostRow(
  post: Record<string, unknown> | undefined,
  postId: string
): ChatProductSummary {
  const meta = parsePostMetaField(post?.meta);
  const isEx = hasExchangeMeta(meta);
  const priceRaw = post?.price as number | string | null | undefined;
  const priceNum =
    priceRaw != null && priceRaw !== ""
      ? Number(priceRaw)
      : null;
  const { phpAmount, rateLine } = isEx
    ? getExchangeFeedLines(meta, priceNum)
    : { phpAmount: null, rateLine: null };

  const envC =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_DEFAULT_CURRENCY?.trim() : "";
  const envL =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_DEFAULT_LOCALE?.trim() : "";
  const listPreview = buildPostListPreviewModel(post, {
    currency: (envC || DEFAULT_APP_SETTINGS.defaultCurrency || "PHP").toUpperCase(),
    locale: envL || DEFAULT_APP_SETTINGS.defaultLocale || "en-PH",
  });

  return {
    id: postId,
    title: displayTitleFromPost(post, postId),
    thumbnail: firstImageUrl(post),
    price: numPrice(post),
    authorNickname: str(post?.author_nickname) || undefined,
    status: (post?.status as string) ?? "active",
    sellerListingState: normalizeSellerListingState(
      post?.seller_listing_state,
      post?.status as string | undefined
    ),
    regionLabel: buildPostRegionLabel(post),
    updatedAt:
      (post && typeof post.updated_at === "string" && post.updated_at) ||
      (post && typeof post.created_at === "string" ? (post.created_at as string) : undefined),
    isExchangePost: isEx,
    exchangePhpAmount: isEx ? phpAmount : undefined,
    exchangeRateSubLine: isEx ? rateLine : undefined,
    listPreview,
  };
}
