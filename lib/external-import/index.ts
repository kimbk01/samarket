/**
 * DIBAY external information import product domain.
 * Crawlee lives in services/crawl-worker — this package owns adapters/parsers/SSOT shapes.
 */

export { SEA_COUNTRY_CODES, isSeaCountryCode } from "./countries";
export type { SeaCountryCode } from "./countries";
export type {
  BoardCapabilities,
  CrawlEngine,
  DetailDocument,
  DocumentNode,
  ExternalBoardDef,
  ExternalSiteDef,
  ExternalSiteProductStatus,
  ListArticle,
  SiteAdapter,
} from "./types";
export { resolveExternalSiteProductStatus } from "./product-status";
export { getSiteAdapter, listRegisteredAdapters } from "./adapters/registry";
export { normalizeDetailDocument, normalizeListArticle, countNodes } from "./document-normalize";
export type { NormalizedArticleRow, NormalizedDocumentRow } from "./document-normalize";
export {
  HELLO_CEBU_THUMB_RULE,
  helloCebuDetailApiUrl,
  helloCebuListApiUrl,
  classifyHelloCebuThumbCases,
} from "./adapters/hellocebuph";
export { PHILSAMO_LIST_SELECTORS } from "./adapters/philsamo";
