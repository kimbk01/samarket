import type { ArticleDocument, ArticleDocumentNode } from "@/lib/community-board-import/article-document";

/**
 * Convert ARTICLE DOCUMENT → Community markdown body.
 * Preserves node order. Images become ![alt](src) in place — never moved to cover.
 */
export function articleDocumentToCommunityMarkdown(doc: ArticleDocument): {
  content: string;
  imageUrlsInOrder: string[];
} {
  const parts: string[] = [];
  const imageUrlsInOrder: string[] = [];
  const seen = new Set<string>();

  for (const node of doc.nodes) {
    const chunk = nodeToMarkdown(node);
    if (chunk) parts.push(chunk);
    if (node.kind === "image") {
      const src = node.src.trim();
      if (src && !seen.has(src)) {
        seen.add(src);
        imageUrlsInOrder.push(src);
      }
    }
  }

  return {
    content: parts.join("\n\n").trim(),
    imageUrlsInOrder,
  };
}

function nodeToMarkdown(node: ArticleDocumentNode): string {
  switch (node.kind) {
    case "heading": {
      const hashes = "#".repeat(Math.min(6, Math.max(1, node.level)));
      return `${hashes} ${node.text.trim()}`;
    }
    case "paragraph":
      return node.text.trim();
    case "image": {
      const src = node.src.trim();
      if (!src) return "";
      const alt = (node.alt ?? "").replace(/[\[\]]/g, "");
      return `![${alt}](${src})`;
    }
    case "list": {
      return node.items
        .map((item, i) => (node.ordered ? `${i + 1}. ${item}` : `- ${item}`))
        .join("\n");
    }
    case "quote":
      return node.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "link":
      return `[${node.text.trim()}](${node.href.trim()})`;
    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}
