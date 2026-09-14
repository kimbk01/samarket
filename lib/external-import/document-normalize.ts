import type { DetailDocument, ListArticle } from "./types";

export type NormalizedArticleRow = {
  externalArticleKey: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  sourcePublishedAt: string | null;
  thumbnailUrl: string | null;
  listPage: number | null;
};

export type NormalizedDocumentRow = NormalizedArticleRow & {
  bodyHtml: string;
  bodyText: string;
  bodyImageUrls: string[];
  galleryImageUrls: string[];
  nodes: DetailDocument["nodes"];
  mediaMeta: DetailDocument["mediaMeta"];
};

export function normalizeListArticle(a: ListArticle): NormalizedArticleRow {
  return {
    externalArticleKey: String(a.externalArticleKey).trim(),
    canonicalUrl: String(a.canonicalUrl).trim(),
    title: String(a.title ?? "").trim(),
    author: a.author ? String(a.author).trim() : null,
    sourcePublishedAt: a.sourcePublishedAt ? String(a.sourcePublishedAt).trim() : null,
    thumbnailUrl: a.thumbnailUrl ? String(a.thumbnailUrl).trim() : null,
    listPage: typeof a.listPage === "number" ? a.listPage : null,
  };
}

export function normalizeDetailDocument(d: DetailDocument): NormalizedDocumentRow {
  return {
    ...normalizeListArticle(d),
    bodyHtml: d.bodyHtml ?? "",
    bodyText: d.bodyText ?? "",
    bodyImageUrls: [...new Set((d.bodyImageUrls ?? []).filter(Boolean))],
    galleryImageUrls: [...new Set((d.galleryImageUrls ?? []).filter(Boolean))],
    nodes: Array.isArray(d.nodes) ? d.nodes : [],
    mediaMeta: d.mediaMeta,
  };
}

export function countNodes(nodes: DetailDocument["nodes"]) {
  const c = { heading: 0, paragraph: 0, list: 0, quote: 0, image: 0, gallery: 0, caption: 0, link: 0 };
  for (const n of nodes) {
    if (n.type in c) (c as Record<string, number>)[n.type] += 1;
  }
  return c;
}
