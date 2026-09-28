export { normalizeGlobalSearchText } from "@/lib/search/global/semantics/normalize";
export {
  tokenizeGlobalSearchQuery,
  isMeaningfulSearchToken,
  meaningfulGlobalSearchTokens,
  isHangulJamoCodePoint,
  countHangulSyllables,
  MIN_LATIN_PREFIX_CHARS,
  MIN_HANGUL_SYLLABLES,
} from "@/lib/search/global/semantics/tokenize";
export {
  isSearchableGlobalQuery,
  isIsolatedHangulJamoQuery,
} from "@/lib/search/global/semantics/is-searchable-query";
export {
  matchGlobalSearchText,
  matchGlobalSearchRecord,
  matchTokenInText,
  findGlobalSearchMatchRanges,
  buildMatchedSnippet,
  type GlobalSearchFieldMatch,
} from "@/lib/search/global/semantics/match";
export {
  buildSearchHighlightSegments,
  type SearchHighlightSegment,
} from "@/lib/search/global/semantics/highlight";
export {
  GLOBAL_SEARCH_ENTRY_DOMAIN_STORAGE_KEY,
  GLOBAL_SEARCH_ENTRY_DOMAINS,
  type GlobalSearchEntryDomain,
  isGlobalSearchEntryDomain,
  parseGlobalSearchEntryDomain,
  readGlobalSearchEntryDomain,
  writeGlobalSearchEntryDomain,
  clearGlobalSearchEntryDomain,
  orderGlobalSearchDomains,
} from "@/lib/search/global/semantics/entry-domain";
export {
  GLOBAL_SEARCH_COMMUNITY_FIELDS,
  GLOBAL_SEARCH_TRADE_FIELDS,
  GLOBAL_SEARCH_DELIVERY_STORE_FIELDS,
  GLOBAL_SEARCH_DELIVERY_MENU_FIELDS,
  GLOBAL_SEARCH_CHAT_FIELDS,
  matchCommunityGlobalSearch,
  matchTradeGlobalSearch,
  matchDeliveryStoreGlobalSearch,
  matchDeliveryMenuGlobalSearch,
  matchChatGlobalSearch,
} from "@/lib/search/global/semantics/domain-fields";
