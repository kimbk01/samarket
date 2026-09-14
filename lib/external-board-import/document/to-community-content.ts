import type { ExternalBoardDocument, ExternalBoardNode } from "@/lib/external-board-import/types";
import { summarizeCommunityPostContent } from "@/lib/philife/interleaved-body-markdown";

function escapeMdLinkText(text: string): string {
  return text.replace(/[\[\]]/g, "");
}

function nodeToMarkdown(node: ExternalBoardNode): string {
  switch (node.type) {
    case "paragraph":
      return node.text.trim();
    case "heading": {
      const hashes = "#".repeat(Math.min(4, Math.max(1, node.level)));
      return `${hashes} ${node.text.trim()}`;
    }
    case "caption":
      return `_${node.text.trim()}_`;
    case "quote":
      return node.text
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join("\n");
    case "list": {
      return node.items
        .map((item, idx) => (node.ordered ? `${idx + 1}. ${item}` : `- ${item}`))
        .join("\n");
    }
    case "link":
      return `[${escapeMdLinkText(node.text || node.href)}](${node.href})`;
    case "image": {
      // decorative images are omitted from Detail body markdown
      if (node.role === "decorative") return "";
      const alt = escapeMdLinkText(node.alt || "");
      return `![${alt}](${node.src})`;
    }
    case "gallery": {
      return node.images
        .map((img) => {
          const alt = escapeMdLinkText(img.alt || "");
          return `![${alt}](${img.src})`;
        })
        .join("\n\n");
    }
    default:
      return "";
  }
}

/**
 * Preserve node order into Community interleaved markdown.
 * Body images stay in content. Optional feedThumbnailSrc prepends Feed thumb
 * without being written into Detail body markdown (no cover→body duplication).
 */
export function externalBoardDocumentToCommunityContent(doc: ExternalBoardDocument): {
  title: string;
  content: string;
  summary: string;
  images: string[];
} {
  const images: string[] = [];
  const feedThumb = String(doc.feedThumbnailSrc ?? "").trim();
  if (feedThumb) images.push(feedThumb);
  const blocks: string[] = [];
  for (const node of doc.nodes) {
    if (node.type === "image") {
      if (node.role === "decorative") continue;
      const src = String(node.src ?? "").trim();
      if (src) images.push(src);
    } else if (node.type === "gallery") {
      for (const img of node.images) {
        const src = String(img.src ?? "").trim();
        if (src) images.push(src);
      }
    }
    const md = nodeToMarkdown(node);
    if (md) blocks.push(md);
  }
  const content = blocks.join("\n\n").trim();
  const title = String(doc.title ?? "").trim() || "Untitled";
  return {
    title,
    content,
    summary: summarizeCommunityPostContent(content),
    images,
  };
}
