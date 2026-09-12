import type { ArticleDocument, ArticleDocumentNode } from "@/lib/community-board-import/article-document";

/**
 * REPLACEMENT CONTRACT
 *
 * SOURCE SNAPSHOT is immutable.
 * Replacement applies only on the DIBAY transform path.
 * Preview and Publish MUST call the same function.
 *
 * Exact string replace only. No AI rewrite / auto-translate / regex / semantic rewrite
 * unless Owner explicitly requests later.
 */

export type BoardImportReplacementRule = {
  id: string;
  from_text: string;
  to_text: string;
  apply_title: boolean;
  apply_body: boolean;
  /** Lower runs first. */
  priority: number;
  enabled: boolean;
};

export type BoardImportTransformInput = {
  sourceTitle: string;
  sourceDocument: ArticleDocument;
  rules: BoardImportReplacementRule[];
};

export type BoardImportTransformResult = {
  dibayTitle: string;
  dibayDocument: ArticleDocument;
};

function replaceExactAll(haystack: string, fromText: string, toText: string): string {
  if (!fromText) return haystack;
  if (!haystack.includes(fromText)) return haystack;
  return haystack.split(fromText).join(toText);
}

function applyRulesToText(
  text: string,
  rules: BoardImportReplacementRule[],
  field: "title" | "body"
): string {
  let out = text;
  const ordered = [...rules]
    .filter((r) => r.enabled && r.from_text)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  for (const rule of ordered) {
    if (field === "title" && !rule.apply_title) continue;
    if (field === "body" && !rule.apply_body) continue;
    out = replaceExactAll(out, rule.from_text, rule.to_text);
  }
  return out;
}

function mapNodeText(
  node: ArticleDocumentNode,
  rules: BoardImportReplacementRule[]
): ArticleDocumentNode {
  switch (node.kind) {
    case "heading":
      return { ...node, text: applyRulesToText(node.text, rules, "body") };
    case "paragraph":
      return { ...node, text: applyRulesToText(node.text, rules, "body") };
    case "quote":
      return { ...node, text: applyRulesToText(node.text, rules, "body") };
    case "link":
      return { ...node, text: applyRulesToText(node.text, rules, "body") };
    case "list":
      return {
        ...node,
        items: node.items.map((item) => applyRulesToText(item, rules, "body")),
      };
    case "image":
      return node;
    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}

/**
 * Single transform authority for Preview and Publish.
 * Does not mutate `sourceDocument`.
 */
export function applyBoardImportReplacement(
  input: BoardImportTransformInput
): BoardImportTransformResult {
  const dibayTitle = applyRulesToText(input.sourceTitle, input.rules, "title");
  const dibayDocument: ArticleDocument = {
    ...input.sourceDocument,
    title: dibayTitle,
    nodes: input.sourceDocument.nodes.map((n) => mapNodeText(n, input.rules)),
  };
  return { dibayTitle, dibayDocument };
}

/** Alias — Preview must call the same transform as Publish. */
export const previewBoardImportReplacement = applyBoardImportReplacement;
export const publishBoardImportReplacement = applyBoardImportReplacement;
