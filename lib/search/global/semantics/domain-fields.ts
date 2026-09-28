import {
  buildMatchedSnippet,
  matchGlobalSearchRecord,
  type GlobalSearchFieldMatch,
} from "@/lib/search/global/semantics/match";

export const GLOBAL_SEARCH_COMMUNITY_FIELDS = ["title", "content", "summary"] as const;
export const GLOBAL_SEARCH_TRADE_FIELDS = ["title"] as const;
export const GLOBAL_SEARCH_DELIVERY_STORE_FIELDS = ["store_name", "description"] as const;
export const GLOBAL_SEARCH_DELIVERY_MENU_FIELDS = ["title", "summary"] as const;
export const GLOBAL_SEARCH_CHAT_FIELDS = ["title", "subtitle", "summary", "lastMessage"] as const;

export type GlobalSearchCommunityField = (typeof GLOBAL_SEARCH_COMMUNITY_FIELDS)[number];
export type GlobalSearchTradeField = (typeof GLOBAL_SEARCH_TRADE_FIELDS)[number];
export type GlobalSearchDeliveryStoreField = (typeof GLOBAL_SEARCH_DELIVERY_STORE_FIELDS)[number];
export type GlobalSearchDeliveryMenuField = (typeof GLOBAL_SEARCH_DELIVERY_MENU_FIELDS)[number];
export type GlobalSearchChatField = (typeof GLOBAL_SEARCH_CHAT_FIELDS)[number];

export function matchCommunityGlobalSearch(fields: {
  title?: string | null;
  content?: string | null;
  summary?: string | null;
}, query: string): GlobalSearchFieldMatch<GlobalSearchCommunityField> {
  return matchGlobalSearchRecord(
    {
      title: fields.title ?? "",
      content: fields.content ?? "",
      summary: fields.summary ?? "",
    },
    GLOBAL_SEARCH_COMMUNITY_FIELDS,
    query
  );
}

/**
 * Neighborhood feed DTOs truncate content to a leading summary.
 * Keyword results must still expose a highlightable matched snippet.
 */
export function communityGlobalSearchFeedPreview(
  fields: {
    title?: string | null;
    content?: string | null;
    summary?: string | null;
  },
  query: string,
  fallbackPreview: string
): { content: string; summary: string } {
  const match = matchCommunityGlobalSearch(fields, query);
  if (!match.matched || match.matchedField === "NONE" || match.matchedField === "title") {
    return { content: fallbackPreview, summary: fallbackPreview };
  }
  const source = match.matchedField === "summary" ? fields.summary : fields.content;
  const snippet = buildMatchedSnippet(source ?? "", query);
  return { content: snippet, summary: snippet };
}

export function matchTradeGlobalSearch(title: string | null | undefined, query: string): GlobalSearchFieldMatch<GlobalSearchTradeField> {
  return matchGlobalSearchRecord({ title: title ?? "" }, GLOBAL_SEARCH_TRADE_FIELDS, query);
}

export function matchDeliveryStoreGlobalSearch(fields: {
  store_name?: string | null;
  description?: string | null;
}, query: string): GlobalSearchFieldMatch<GlobalSearchDeliveryStoreField> {
  return matchGlobalSearchRecord(
    {
      store_name: fields.store_name ?? "",
      description: fields.description ?? "",
    },
    GLOBAL_SEARCH_DELIVERY_STORE_FIELDS,
    query
  );
}

export function matchDeliveryMenuGlobalSearch(fields: {
  title?: string | null;
  summary?: string | null;
}, query: string): GlobalSearchFieldMatch<GlobalSearchDeliveryMenuField> {
  return matchGlobalSearchRecord(
    {
      title: fields.title ?? "",
      summary: fields.summary ?? "",
    },
    GLOBAL_SEARCH_DELIVERY_MENU_FIELDS,
    query
  );
}

export function matchChatGlobalSearch(fields: {
  title?: string | null;
  subtitle?: string | null;
  summary?: string | null;
  lastMessage?: string | null;
}, query: string): GlobalSearchFieldMatch<GlobalSearchChatField> {
  return matchGlobalSearchRecord(
    {
      title: fields.title ?? "",
      subtitle: fields.subtitle ?? "",
      summary: fields.summary ?? "",
      lastMessage: fields.lastMessage ?? "",
    },
    GLOBAL_SEARCH_CHAT_FIELDS,
    query
  );
}
