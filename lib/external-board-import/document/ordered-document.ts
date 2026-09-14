import type { ExternalBoardDocument, ExternalBoardNode } from "@/lib/external-board-import/types";

export function isExternalBoardNode(value: unknown): value is ExternalBoardNode {
  if (!value || typeof value !== "object") return false;
  const n = value as Record<string, unknown>;
  const type = String(n.type ?? "");
  switch (type) {
    case "paragraph":
    case "quote":
    case "caption":
      return typeof n.text === "string";
    case "heading": {
      const level = Number(n.level);
      return typeof n.text === "string" && level >= 1 && level <= 4;
    }
    case "image": {
      if (typeof n.src !== "string" || !String(n.src).trim()) return false;
      // LOCK 5: thumbnail role forbidden on body nodes
      if (n.role != null && n.role !== "body" && n.role !== "gallery" && n.role !== "decorative") {
        return false;
      }
      return true;
    }
    case "gallery":
      return (
        Array.isArray(n.images) &&
        n.images.every(
          (img) =>
            img &&
            typeof img === "object" &&
            typeof (img as { src?: unknown }).src === "string" &&
            String((img as { src: string }).src).trim().length > 0
        )
      );
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
    if (n.type === "paragraph" || n.type === "quote" || n.type === "caption" || n.type === "heading") {
      return n.text.trim().length > 0;
    }
    if (n.type === "list") return n.items.some((it) => String(it).trim().length > 0);
    if (n.type === "link") return n.text.trim().length > 0 || n.href.trim().length > 0;
    if (n.type === "image" || n.type === "gallery") return true;
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
