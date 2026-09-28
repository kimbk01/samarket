import type { PostWithMeta } from "@/lib/posts/schema";
import { applyMarketplaceQueryToPostgrest, sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";

/** Test-only: same hard-query authority as `applyMarketplaceQueryToPostgrest` (title ILIKE). */
export function inspectTradeTitleIlikeMatch(
  query: string,
  result: { id: string; title: string }
): {
  QUERY: string;
  RESULT_ID: string;
  TITLE: string;
  MATCH_FIELD: "title" | "NONE";
  MATCH_VALUE: string;
} {
  const text = sanitizeMarketplaceQueryText(query);
  let matched = false;
  if (text) {
    const q = {
      ilike(column: string, pattern: string) {
        if (column === "title" && pattern === `%${text}%`) {
          matched = result.title.toLowerCase().includes(text.toLowerCase());
        }
        return this;
      },
      gte() {
        return this;
      },
      lte() {
        return this;
      },
    };
    applyMarketplaceQueryToPostgrest(q, { q: query });
  }
  return {
    QUERY: query,
    RESULT_ID: result.id,
    TITLE: result.title,
    MATCH_FIELD: matched ? "title" : "NONE",
    MATCH_VALUE: matched ? result.title : "",
  };
}

export function selectTitleIlikeMatched<T extends { id: string; title: string }>(
  query: string,
  rows: T[]
): T[] {
  return rows.filter((row) => inspectTradeTitleIlikeMatch(query, row).MATCH_FIELD === "title");
}

export function tradePostFixture(id: string, title: string, extra?: Partial<PostWithMeta>): PostWithMeta {
  return {
    id,
    category_id: "cat",
    author_id: "author",
    type: "trade",
    title,
    content: extra?.content ?? "",
    price: extra?.price ?? 1,
    is_price_offer: false,
    is_free_share: false,
    region: extra?.region ?? "NCR",
    city: extra?.city ?? "Pasig",
    barangay: extra?.barangay ?? null,
    contact_method: null,
    status: extra?.status ?? "active",
    view_count: 0,
    thumbnail_url: extra?.thumbnail_url ?? null,
    images: extra?.images ?? null,
    created_at: extra?.created_at ?? "2026-08-18T10:00:00.000Z",
    updated_at: extra?.updated_at ?? "2026-08-18T10:00:00.000Z",
    ...extra,
  };
}
