/** Fresh PHASE E operator-import types — not OLD external-import schema. */

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
};

export type OperatorDraftEdit = {
  displayTitle: string;
  displayAuthor: string;
  displayDate: string;
  replaceFrom: string;
  replaceTo: string;
  /** block index → included (images only; missing means included) */
  imageIncludes: Record<string, boolean>;
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

export const PHILSAMO_SOURCE_SITE = "philsamo";
export const PHILSAMO_BASE = "https://philsamo.com";
export const PHILSAMO_TRAVEL_BOARD = "travel";
export const PHILSAMO_TRAVEL_LABEL = "필리핀 여행";
