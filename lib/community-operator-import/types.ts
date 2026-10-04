/** Operator-import (B+) shared types. */

export type OperatorContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "image"; url: string; displaySrc: string | null; alt: string | null; caption: string | null }
  | { type: "link"; href: string | null; text: string | null }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string };

export type OperatorListRow = {
  articleKey: string;
  title: string;
  detailUrl: string;
  author: string | null;
  sourcePublishedDate: string | null;
  thumbnailUrl: string | null;
  listOrder: number;
  /** Publisher-provided summary (RSS description / WP excerpt), plain text. */
  summary?: string | null;
};

export type QualityVerdict = "FULL" | "PARTIAL" | "FAILED";

export type ExtractionReport = {
  /** Selector or method that produced the body (e.g. `#bo_v_con`, `wp-api`, `feed`, `auto:density`). */
  bodySource: string;
  /** Images visible on the source page (body + attachments), before filtering duplicates. */
  sourceImageCount: number;
  /** og:image / featured image of the source page. */
  ogImage: string | null;
  /** True when the article page could not be fetched and a feed summary was used instead. */
  usedFeedFallback: boolean;
  /** Non-fatal warnings (e.g. `article_fetch_failed: HTTP 403`). */
  warnings: string[];
};

export type OperatorNormalizedArticle = {
  sourceSite: string;
  sourceBoard: string;
  sourceBoardLabel: string;
  canonicalUrl: string;
  sourceArticleKey: string;
  title: string;
  author: string | null;
  sourcePublishedDate: string | null;
  orderedContentBlocks: OperatorContentBlock[];
  /** Feed/publisher summary when available (used by summary_link policy). */
  summary?: string | null;
  extraction?: ExtractionReport;
  quality?: { verdict: QualityVerdict; reasons: string[] };
};

export type OperatorDraftEdit = {
  displayTitle: string;
  displayAuthor: string;
  displayDate: string;
  replaceFrom: string;
  replaceTo: string;
  /** block index → included (images only; missing means included) */
  imageIncludes: Record<string, boolean>;
  /** non-image source block index → excluded when true */
  blockExcludes?: Record<string, boolean>;
  /** optional freeform text override for paragraph/heading/quote/list by source index */
  textOverrides?: Record<string, string>;
  /** Ordered source image block indices. Empty/missing = source order. */
  imageOrder?: number[];
  /** source image block index used as Feed thumbnail (must be included) */
  thumbnailImageIndex?: number | null;
  topicId: string | null;
  topicSlug: string | null;
};

export type OperatorDraftRecord = {
  id: string;
  sourceSite: string;
  sourceBoard: string;
  sourceArticleKey: string;
  canonicalUrl: string;
  original: OperatorNormalizedArticle;
  edit: OperatorDraftEdit;
  status: "draft" | "published";
  publishedPostId: string | null;
  updatedAt: string;
};

/** Engines stored in `community_operator_import_sources.engine`. */
export type SourceEngine = "gnuboard" | "wordpress_rest" | "rss_atom" | "html";

/** How much of a source may be republished on DIBAY. */
export type ContentPolicy = "full" | "summary_link" | "link_only";

/** Board nature used for safety defaults (member Q&A / ads are never default-collected). */
export type BoardKind = "editorial" | "community" | "member_qa" | "directory" | "ads" | "unknown";

/** Per-source adapter configuration (DB `adapter_config`). Never hard-coded in engines. */
export type AdapterConfig = {
  /** Extra body selectors tried before generic ones. */
  bodySelectors?: string[];
  /** Selectors removed from the body before normalization (skin headers, share bars). */
  removeSelectors?: string[];
  /** Attachment image containers (gnuboard skins). */
  attachmentSelectors?: string[];
  /** Date element selector for HTML sources without meta dates. */
  dateSelector?: string;
  /** HTML engine: list item URL template detected/confirmed by the admin, e.g. `/news/article.html?no=#`. */
  itemUrlTemplate?: string;
  /** RSS engine: fetch the article page for the full body (default true). */
  fetchArticle?: boolean;
};

export type RuntimeSource = {
  id: string;
  displayName: string;
  baseUrl: string;
  engine: SourceEngine;
  enabled: boolean;
  contentPolicy: ContentPolicy;
  adapterConfig: AdapterConfig;
  verification: string;
};

export type RuntimeBoard = {
  sourceId: string;
  boardId: string;
  displayName: string;
  shortLabel: string;
  category: string;
  /** gnuboard bo_table · WP category id or `all` · feed URL · HTML list URL */
  engineKey: string;
  enabled: boolean;
  collectEnabled: boolean;
  boardKind: BoardKind;
  defaultTopicId: string | null;
};
