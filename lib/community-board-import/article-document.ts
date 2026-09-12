/**
 * ARTICLE DOCUMENT — canonical semantic order for imported articles.
 * Do not split into title + plain body + cover + bodyImages[] and lose order.
 */

export const ARTICLE_DOCUMENT_NODE_KINDS = [
  "heading",
  "paragraph",
  "image",
  "list",
  "quote",
  "link",
] as const;

export type ArticleDocumentNodeKind = (typeof ARTICLE_DOCUMENT_NODE_KINDS)[number];

export type ArticleDocumentHeadingNode = {
  kind: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
};

export type ArticleDocumentParagraphNode = {
  kind: "paragraph";
  text: string;
};

export type ArticleDocumentImageNode = {
  kind: "image";
  /** Source or rehosted URL — identity may change after rehost; order must not. */
  src: string;
  alt?: string;
  /** Stable identity within the document (for thumbnail REFERENCE). */
  imageId: string;
};

export type ArticleDocumentListNode = {
  kind: "list";
  ordered: boolean;
  items: string[];
};

export type ArticleDocumentQuoteNode = {
  kind: "quote";
  text: string;
};

export type ArticleDocumentLinkNode = {
  kind: "link";
  href: string;
  text: string;
};

export type ArticleDocumentNode =
  | ArticleDocumentHeadingNode
  | ArticleDocumentParagraphNode
  | ArticleDocumentImageNode
  | ArticleDocumentListNode
  | ArticleDocumentQuoteNode
  | ArticleDocumentLinkNode;

export type ArticleDocument = {
  title: string;
  nodes: ArticleDocumentNode[];
  sourceAuthor?: string | null;
  sourceDateIso?: string | null;
  canonicalUrl: string;
};

/** Feed thumbnail = REFERENCE to first valid inline image. Not MOVE, not DUPLICATE. */
export function firstValidInlineImage(
  doc: ArticleDocument
): ArticleDocumentImageNode | null {
  for (const n of doc.nodes) {
    if (n.kind === "image" && n.src.trim()) return n;
  }
  return null;
}

export function countInlineImages(doc: ArticleDocument): number {
  return doc.nodes.filter((n) => n.kind === "image").length;
}

/** Structural fingerprint for fidelity asserts (order + kinds + image ids). */
export function articleDocumentStructureKey(doc: ArticleDocument): string {
  return doc.nodes
    .map((n) => {
      if (n.kind === "image") return `image:${n.imageId}`;
      if (n.kind === "heading") return `heading:${n.level}`;
      if (n.kind === "list") return `list:${n.ordered ? "ol" : "ul"}:${n.items.length}`;
      return n.kind;
    })
    .join("|");
}
