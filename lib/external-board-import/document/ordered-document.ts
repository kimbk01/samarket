import type { ExternalBoardDocument, ExternalBoardNode } from "@/lib/external-board-import/types";

export function isExternalBoardNode(value: unknown): value is ExternalBoardNode {
  if (!value || typeof value !== "object") return false;
  const n = value as Record<string, unknown>;
  const type = String(n.type ?? "");
  switch (type) {
    case "paragraph":
    case "quote":
      return typeof n.text === "string";
    case "image":
      return typeof n.src === "string" && String(n.src).trim().length > 0;
    case "list":
      return typeof n.ordered === "boolean" && Array.isArray(n.items);
    case "link":
      return typeof n.href === "string" && typeof n.text === "string";
    default:
      return false;
  }
}

export function validateExternalBoardDocument(raw: unknown): {
  ok: true;
  document: ExternalBoardDocument;
} | {
  ok: false;
  failureCode: string;
  failureMessage: string;
} {
  if (!raw || typeof raw !== "object") {
    return { ok: false, failureCode: "document_invalid", failureMessage: "Document must be an object." };
  }
  const d = raw as Record<string, unknown>;
  const title = String(d.title ?? "").trim();
  const canonicalUrl = String(d.canonicalUrl ?? "").trim();
  if (!canonicalUrl) {
    return { ok: false, failureCode: "document_missing_url", failureMessage: "canonicalUrl is required." };
  }
  if (!Array.isArray(d.nodes)) {
    return { ok: false, failureCode: "document_nodes_missing", failureMessage: "nodes array is required." };
  }
  const nodes: ExternalBoardNode[] = [];
  for (let i = 0; i < d.nodes.length; i += 1) {
    const node = d.nodes[i];
    if (!isExternalBoardNode(node)) {
      return {
        ok: false,
        failureCode: "document_node_invalid",
        failureMessage: `Invalid node at index ${i}.`,
      };
    }
    nodes.push(node);
  }
  const hasBody = nodes.some((n) => {
    if (n.type === "paragraph" || n.type === "quote") return n.text.trim().length > 0;
    if (n.type === "list") return n.items.some((it) => String(it).trim().length > 0);
    if (n.type === "link") return n.text.trim().length > 0 || n.href.trim().length > 0;
    if (n.type === "image") return true;
    return false;
  });
  if (!title && !hasBody) {
    return {
      ok: false,
      failureCode: "document_empty",
      failureMessage: "Document needs a title or body nodes.",
    };
  }
  return {
    ok: true,
    document: {
      title,
      canonicalUrl,
      nodes,
      feedThumbnailSrc:
        d.feedThumbnailSrc != null && String(d.feedThumbnailSrc).trim()
          ? String(d.feedThumbnailSrc).trim()
          : null,
    },
  };
}

export function emptyExternalBoardDocument(canonicalUrl: string, title = ""): ExternalBoardDocument {
  return { title, canonicalUrl, nodes: [] };
}
