/**
 * Limited Safe Markdown for Customer Center content bodies.
 * Plain text ⊂ markdown. No HTML authority. No TipTap/JSON.
 */

import { isCustomerCenterRenderableMediaUrl } from "@/lib/notices/customer-center-media";

export type MarkdownWrapKind =
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "ul"
  | "ol"
  | "quote"
  | "link"
  | "image";

const MAX_URL_LEN = 2048;
const MAX_TOKEN_LEN = 120;

function isAllowedHref(raw: string): boolean {
  const href = raw.trim();
  if (!href || href.length > MAX_URL_LEN) return false;
  if (/^javascript:/i.test(href) || /^data:/i.test(href) || /^vbscript:/i.test(href)) {
    return false;
  }
  if (href.startsWith("/")) return true;
  try {
    const u = new URL(href);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function softBreakLongTokens(text: string): string {
  return text.replace(/\S+/g, (token) => {
    if (token.length <= MAX_TOKEN_LEN) return token;
    const parts: string[] = [];
    for (let i = 0; i < token.length; i += MAX_TOKEN_LEN) {
      parts.push(token.slice(i, i + MAX_TOKEN_LEN));
    }
    return parts.join("\u200b");
  });
}

export function insertCustomerCenterMarkdown(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  kind: MarkdownWrapKind,
  extras?: { url?: string; alt?: string }
): { next: string; selectionStart: number; selectionEnd: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);

  const wrap = (left: string, right: string, placeholder: string) => {
    const inner = selected || placeholder;
    const next = `${before}${left}${inner}${right}${after}`;
    const selStart = before.length + left.length;
    return { next, selectionStart: selStart, selectionEnd: selStart + inner.length };
  };

  switch (kind) {
    case "h2":
      return wrap("\n## ", "\n", "소제목");
    case "h3":
      return wrap("\n### ", "\n", "작은 제목");
    case "bold":
      return wrap("**", "**", "굵게");
    case "italic":
      return wrap("*", "*", "기울임");
    case "ul":
      return wrap("\n- ", "\n", "목록 항목");
    case "ol":
      return wrap("\n1. ", "\n", "번호 항목");
    case "quote":
      return wrap("\n> ", "\n", "인용");
    case "link": {
      const url = (extras?.url ?? "https://").trim();
      const safe = isAllowedHref(url) ? url : "https://";
      const label = selected || "링크";
      const snippet = `[${label}](${safe})`;
      const next = `${before}${snippet}${after}`;
      return {
        next,
        selectionStart: before.length,
        selectionEnd: before.length + snippet.length,
      };
    }
    case "image": {
      const url = (extras?.url ?? "").trim();
      if (!isCustomerCenterRenderableMediaUrl(url)) {
        return { next: value, selectionStart: start, selectionEnd: end };
      }
      const alt = (extras?.alt ?? "이미지").replace(/[\[\]]/g, "");
      const snippet = `\n![${alt}](${url})\n`;
      const next = `${before}${snippet}${after}`;
      return {
        next,
        selectionStart: before.length + snippet.length,
        selectionEnd: before.length + snippet.length,
      };
    }
    default:
      return { next: value, selectionStart: start, selectionEnd: end };
  }
}

/** Strip markdown syntax for list excerpts — plain readable text. */
export function excerptCustomerCenterMarkdown(body: string, maxLen = 120): string {
  let s = String(body ?? "");
  s = s.replace(/!\[[^\]]*]\([^)]+\)/g, " ");
  s = s.replace(/\[([^\]]*)]\([^)]+\)/g, "$1");
  // Strip heading markers repeatedly (e.g. "## ## Title").
  for (let i = 0; i < 4; i += 1) {
    const next = s.replace(/^#{1,6}\s*/gm, "");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/^\s*>\s?/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/^\s*\d+\.\s+/gm, "");
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  s = s.replace(/\*{1,2}/g, "");
  s = s.replace(/`+/g, "");
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

export type SafeMarkdownBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "quote"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "image"; src: string; alt: string }
  | { type: "html_blocked"; text: string };

function parseInlineSegments(text: string): Array<{ kind: "text" | "bold" | "italic" | "link"; text: string; href?: string }> {
  const out: Array<{ kind: "text" | "bold" | "italic" | "link"; text: string; href?: string }> = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      out.push({ kind: "text", text: softBreakLongTokens(text.slice(last, m.index)) });
    }
    if (m[2] != null) out.push({ kind: "bold", text: softBreakLongTokens(m[2]) });
    else if (m[3] != null) out.push({ kind: "italic", text: softBreakLongTokens(m[3]) });
    else if (m[4] != null && m[5] != null) {
      const href = m[5].trim();
      if (isAllowedHref(href)) out.push({ kind: "link", text: softBreakLongTokens(m[4]), href });
      else out.push({ kind: "text", text: softBreakLongTokens(m[4]) });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: softBreakLongTokens(text.slice(last)) });
  if (out.length === 0) out.push({ kind: "text", text: softBreakLongTokens(text) });
  return out;
}

export function parseCustomerCenterSafeMarkdown(body: string): SafeMarkdownBlock[] {
  const lines = String(body ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: SafeMarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    if (/<\/?[a-zA-Z]/.test(trimmed) || /<script/i.test(trimmed) || /<iframe/i.test(trimmed)) {
      blocks.push({ type: "html_blocked", text: trimmed.replace(/<[^>]*>/g, "") });
      i += 1;
      continue;
    }
    const img = trimmed.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
    if (img) {
      const src = (img[2] ?? "").trim();
      if (isCustomerCenterRenderableMediaUrl(src)) {
        blocks.push({ type: "image", src, alt: img[1] ?? "" });
      }
      i += 1;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", text: trimmed.slice(3).replace(/^#+\s*/, "") });
      i += 1;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", text: trimmed.slice(4).replace(/^#+\s*/, "") });
      i += 1;
      continue;
    }
    if (trimmed.startsWith("> ")) {
      blocks.push({ type: "quote", text: trimmed.slice(2) });
      i += 1;
      continue;
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^[-*+]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    const para: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = (lines[i] ?? "").trim();
      if (!next) break;
      if (
        next.startsWith("## ") ||
        next.startsWith("### ") ||
        next.startsWith("> ") ||
        /^[-*+]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        /^!\[/.test(next) ||
        /<\/?[a-zA-Z]/.test(next)
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    blocks.push({ type: "p", text: para.join(" ") });
  }
  return blocks.filter((b) => {
    if (b.type !== "p") return true;
    const t = b.text.trim();
    // Drop orphan emphasis markers left by bad fixtures (e.g. lone "**").
    return t.length > 0 && !/^\*{1,2}$/.test(t);
  });
}

/** Body renderer uses text nodes only — never HTML strings. */
export function safeInlineNodes(text: string): Array<{
  key: string;
  kind: "text" | "bold" | "italic" | "link";
  text: string;
  href?: string;
}> {
  return parseInlineSegments(text).map((seg, idx) => ({
    key: `${idx}-${seg.kind}`,
    ...seg,
  }));
}
