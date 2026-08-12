/**
 * Customer Center Safe Markdown — plain text ⊂ limited markdown.
 * Storage remains app_notices.body text. No HTML/JSON authority.
 */

const IMG_MD_RE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK_MD_RE = /\[([^\]]*)\]\([^)]*\)/g;

/** Allow http(s) and app-relative paths only. */
export function sanitizeCustomerCenterMarkdownHref(href: string | null | undefined): string | null {
  const t = String(href ?? "").trim();
  if (!t) return null;
  if (t.startsWith("/") && !t.startsWith("//") && !t.includes("://")) {
    if (/[\s<>"']/.test(t)) return null;
    return t;
  }
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Body images / remote assets — https preferred; http allowed for legacy. */
export function sanitizeCustomerCenterMarkdownImageSrc(src: string | null | undefined): string | null {
  const t = String(src ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * List / card excerpt — READ-TIME from Content.body only.
 * Never use Campaign.body. Strips markdown tokens so they never show in list UI.
 */
export function customerCenterPlainExcerpt(body: string | null | undefined, max = 160): string {
  let s = String(body ?? "");
  s = s.replace(IMG_MD_RE, " ");
  s = s.replace(LINK_MD_RE, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^>\s?/gm, "");
  s = s.replace(/^[-*+]\s+/gm, "");
  s = s.replace(/^\d+\.\s+/gm, "");
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  s = s.replace(/`+/g, "");
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max).trimEnd()}…`;
}

/** First markdown image URL in body (optional list thumbnail). */
export function customerCenterFirstBodyImageUrl(body: string | null | undefined): string | null {
  const m = /!\[[^\]]*\]\(([^)]+)\)/.exec(String(body ?? ""));
  if (!m?.[1]) return null;
  return sanitizeCustomerCenterMarkdownImageSrc(m[1].trim());
}

export type MarkdownWrapKind =
  | "bold"
  | "italic"
  | "h2"
  | "h3"
  | "ul"
  | "ol"
  | "quote"
  | "link"
  | "image";

/**
 * Insert safe markdown around selection (or at cursor). Pure string helper for toolbar.
 */
export function insertCustomerCenterMarkdown(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  kind: MarkdownWrapKind,
  extras?: { url?: string; alt?: string }
): { next: string; selectionStart: number; selectionEnd: number } {
  const start = Math.max(0, Math.min(selectionStart, source.length));
  const end = Math.max(start, Math.min(selectionEnd, source.length));
  const selected = source.slice(start, end);
  const before = source.slice(0, start);
  const after = source.slice(end);

  const wrapInline = (open: string, close: string, placeholder: string) => {
    const inner = selected || placeholder;
    const block = `${open}${inner}${close}`;
    return {
      next: before + block + after,
      selectionStart: before.length + open.length,
      selectionEnd: before.length + open.length + inner.length,
    };
  };

  switch (kind) {
    case "bold":
      return wrapInline("**", "**", "굵게");
    case "italic":
      return wrapInline("*", "*", "기울임");
    case "h2": {
      const line = selected || "소제목";
      const block = `## ${line.replace(/^#+\s*/, "")}`;
      return {
        next: `${before}${before.endsWith("\n") || !before ? "" : "\n"}${block}\n${after}`,
        selectionStart: before.length,
        selectionEnd: before.length + block.length + (before.endsWith("\n") || !before ? 0 : 1),
      };
    }
    case "h3": {
      const line = selected || "작은 제목";
      const block = `### ${line.replace(/^#+\s*/, "")}`;
      return {
        next: `${before}${before.endsWith("\n") || !before ? "" : "\n"}${block}\n${after}`,
        selectionStart: before.length,
        selectionEnd: before.length + block.length + (before.endsWith("\n") || !before ? 0 : 1),
      };
    }
    case "ul": {
      const lines = (selected || "항목").split("\n").map((l) => `- ${l.replace(/^[-*+]\s+/, "")}`);
      const block = lines.join("\n");
      return {
        next: `${before}${before && !before.endsWith("\n") ? "\n" : ""}${block}\n${after}`,
        selectionStart: before.length,
        selectionEnd: before.length + block.length,
      };
    }
    case "ol": {
      const lines = (selected || "항목")
        .split("\n")
        .map((l, i) => `${i + 1}. ${l.replace(/^\d+\.\s+/, "")}`);
      const block = lines.join("\n");
      return {
        next: `${before}${before && !before.endsWith("\n") ? "\n" : ""}${block}\n${after}`,
        selectionStart: before.length,
        selectionEnd: before.length + block.length,
      };
    }
    case "quote": {
      const lines = (selected || "인용").split("\n").map((l) => `> ${l.replace(/^>\s?/, "")}`);
      const block = lines.join("\n");
      return {
        next: `${before}${before && !before.endsWith("\n") ? "\n" : ""}${block}\n${after}`,
        selectionStart: before.length,
        selectionEnd: before.length + block.length,
      };
    }
    case "link": {
      const url = sanitizeCustomerCenterMarkdownHref(extras?.url ?? "");
      if (!url) {
        return { next: source, selectionStart: start, selectionEnd: end };
      }
      const label = selected || "링크";
      const block = `[${label}](${url})`;
      return {
        next: before + block + after,
        selectionStart: before.length,
        selectionEnd: before.length + block.length,
      };
    }
    case "image": {
      const url = sanitizeCustomerCenterMarkdownImageSrc(extras?.url ?? "");
      if (!url) {
        return { next: source, selectionStart: start, selectionEnd: end };
      }
      const alt = (extras?.alt ?? selected ?? "이미지").replace(/[\[\]]/g, "");
      const block = `![${alt}](${url})`;
      return {
        next: `${before}${before && !before.endsWith("\n") ? "\n" : ""}${block}\n${after}`,
        selectionStart: before.length,
        selectionEnd: before.length + block.length,
      };
    }
    default:
      return { next: source, selectionStart: start, selectionEnd: end };
  }
}
