import type { SeaCountryCode } from "./countries";

export type CrawlEngine = "cheerio" | "playwright";

export type ExternalSiteDef = {
  countryCode: SeaCountryCode;
  siteKey: string;
  name: string;
  baseUrl: string;
  engine: CrawlEngine;
  adapterKey: string;
};

/** Operator-facing product status — not crawl engine. */
export type ExternalSiteProductStatus = "USABLE" | "BLOCKED" | "NOT_PROVEN" | "LOGIN_REQUIRED";

export type BoardCapabilities = {
  supportsRecent: boolean;
  supportsPageRange: boolean;
  supportsDateRange: boolean;
  /** When supportsRecent — e.g. [10, 20, 50] */
  recentCounts?: number[];
};

export type ExternalBoardDef = {
  siteKey: string;
  boardKey: string;
  name: string;
  listUrl: string;
  topicHint?: string;
  capabilities?: BoardCapabilities;
};

export type ListArticle = {
  externalArticleKey: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  sourcePublishedAt: string | null;
  thumbnailUrl: string | null;
  listPage?: number;
};

export type DocumentNode =
  | { type: "heading"; text: string; level?: number }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "link"; href: string; text?: string }
  | { type: "image"; src: string; alt?: string; caption?: string }
  | { type: "gallery"; urls: string[] }
  | { type: "caption"; text: string };

export type DetailDocument = {
  externalArticleKey: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  sourcePublishedAt: string | null;
  bodyHtml: string;
  bodyText: string;
  thumbnailUrl: string | null;
  bodyImageUrls: string[];
  galleryImageUrls: string[];
  nodes: DocumentNode[];
  mediaMeta: {
    thumbnailAuthority: string;
    bodyImageSelector: string;
    gallerySelector: string;
    decorativeExclusions: string[];
  };
};

export type SiteAdapter = {
  site: ExternalSiteDef;
  listBoards: () => Promise<ExternalBoardDef[]> | ExternalBoardDef[];
  fetchArticleList: (input: {
    board: ExternalBoardDef;
    html: string;
    pageUrl: string;
  }) => ListArticle[];
  fetchArticleDetail: (input: {
    article: ListArticle;
    html: string;
    pageUrl: string;
  }) => DetailDocument;
  nextListPageUrl?: (input: { board: ExternalBoardDef; pageUrl: string; html: string }) => string | null;
};
