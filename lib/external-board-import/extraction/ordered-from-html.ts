import * as cheerio from "cheerio";
import type { ExternalBoardDocument, ExternalBoardNode } from "@/lib/external-board-import/types";
import { absolutizeUrl } from "@/lib/external-board-import/extraction/fetch-html";

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "footer",
  "header",
  "form",
  "button",
  "svg",
]);

/** Minimal DOM node shape — avoids domhandler export/version drift in typecheck. */
type DomNode = {
  type?: string;
  data?: string;
  name?: string;
  children?: DomNode[];
  attribs?: Record<string, string>;
};

function isDecorativeImage(src: string, alt: string): boolean {
  const s = `${src} ${alt}`.toLowerCase();
  return /icon|logo|avatar|emoji|spacer|blank|1x1|pixel|btn_|button|badge|spinner|tracking/i.test(s);
}

function pushParagraph(nodes: ExternalBoardNode[], text: string) {
  const t = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return;
  nodes.push({ type: "paragraph", text: t });
}

/**
 * Walk a content root in document order → ExternalBoardNode[].
 * Does not separate text/images into parallel arrays.
 */
export function extractOrderedNodesFromHtmlRoot(
  html: string,
  baseUrl: string,
  rootSelector: string
): ExternalBoardNode[] {
  const $ = cheerio.load(html);
  const root = $(rootSelector).first();
  if (!root.length) return [];

  const nodes: ExternalBoardNode[] = [];

  const walk = (el: DomNode) => {
    if (el.type === "text") {
      pushParagraph(nodes, String(el.data ?? ""));
      return;
    }
    if (el.type !== "tag") return;
    const tag = String(el.name ?? "").toLowerCase();
    if (SKIP_TAGS.has(tag)) return;

    // Cheerio selection over a raw node — cast only at the boundary.
    const $el = $(el as never);

    if (tag === "br") {
      pushParagraph(nodes, "\n");
      return;
    }

    if (tag === "img") {
      const srcRaw = String($el.attr("src") || $el.attr("data-src") || "").trim();
      const abs = absolutizeUrl(baseUrl, srcRaw);
      const alt = String($el.attr("alt") || "").trim();
      if (abs && !isDecorativeImage(abs, alt)) {
        nodes.push({ type: "image", src: abs, alt: alt || undefined });
      }
      return;
    }

    if (tag === "a") {
      const hrefRaw = String($el.attr("href") || "").trim();
      const abs = absolutizeUrl(baseUrl, hrefRaw);
      const text = $el.text().replace(/\s+/g, " ").trim();
      const childImgs = $el.find("img");
      if (childImgs.length) {
        childImgs.each((_, img) => walk(img as DomNode));
        return;
      }
      if (abs && text && !abs.startsWith("mailto:")) {
        nodes.push({ type: "link", href: abs, text });
        return;
      }
    }

    if (tag === "blockquote") {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text) nodes.push({ type: "quote", text });
      return;
    }

    if (tag === "ul" || tag === "ol") {
      const items: string[] = [];
      $el.children("li").each((_, li) => {
        const t = $(li).text().replace(/\s+/g, " ").trim();
        if (t) items.push(t);
      });
      if (items.length) nodes.push({ type: "list", ordered: tag === "ol", items });
      return;
    }

    if (
      tag === "p" ||
      tag === "h1" ||
      tag === "h2" ||
      tag === "h3" ||
      tag === "h4" ||
      tag === "li" ||
      tag === "div" ||
      tag === "span" ||
      tag === "td" ||
      tag === "font"
    ) {
      const children = el.children ?? [];
      const onlyText =
        children.length === 0 ||
        children.every(
          (c) =>
            c.type === "text" ||
            (c.type === "tag" &&
              ["br", "b", "strong", "i", "em", "u", "font", "span"].includes(String(c.name ?? "").toLowerCase()))
        );
      if (onlyText && (tag === "p" || tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "li")) {
        pushParagraph(nodes, $el.text());
        return;
      }
      for (const child of children) walk(child);
      return;
    }

    for (const child of el.children ?? []) walk(child);
  };

  const rootNode = root.get(0) as DomNode | undefined;
  for (const child of rootNode?.children ?? []) walk(child);

  // Merge adjacent empty / whitespace-only paragraphs out; keep order.
  const cleaned: ExternalBoardNode[] = [];
  for (const n of nodes) {
    if (n.type === "paragraph" && !n.text.trim()) continue;
    if (
      n.type === "paragraph" &&
      cleaned.length &&
      cleaned[cleaned.length - 1]?.type === "paragraph" &&
      (cleaned[cleaned.length - 1] as { text: string }).text === n.text
    ) {
      continue;
    }
    cleaned.push(n);
  }
  return cleaned;
}

export function buildDocumentFromHtml(input: {
  title: string;
  canonicalUrl: string;
  html: string;
  baseUrl: string;
  rootSelector: string;
}): ExternalBoardDocument {
  const nodes = extractOrderedNodesFromHtmlRoot(input.html, input.baseUrl, input.rootSelector);
  return {
    title: input.title.trim(),
    canonicalUrl: input.canonicalUrl,
    nodes,
  };
}

export function extractMetaAuthor(html: string): string | null {
  const $ = cheerio.load(html);
  const meta =
    $('meta[name="author"]').attr("content") ||
    $('meta[property="article:author"]').attr("content") ||
    $('meta[property="og:author"]').attr("content") ||
    null;
  const t = String(meta ?? "").trim();
  return t || null;
}

export function extractOgTitle(html: string): string | null {
  const $ = cheerio.load(html);
  const t =
    $('meta[property="og:title"]').attr("content") ||
    $("title").first().text() ||
    $("h1").first().text() ||
    "";
  return String(t).replace(/\s+/g, " ").trim() || null;
}
