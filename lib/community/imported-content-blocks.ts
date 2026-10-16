/**
 * Structured body of an imported community post (`community_posts.content_blocks`).
 * The plain `content` column stays the authority for summary/search/feed; these blocks only let the
 * detail page show the original structure (headings, lists, quotes, tables, captions, links) in
 * DIBAY styling. No HTML, no CSS, no scripts from the source ever reach the page.
 * Sanitized when written (publish) and again when read (detail) — pure, unit-tested.
 */

export type ImportedContentBlock =
  | { t: "p"; text: string }
  | { t: "h"; level: 2 | 3; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "quote"; text: string }
  | { t: "table"; rows: string[][]; header: boolean }
  | { t: "img"; url: string; alt: string | null; caption: string | null }
  | { t: "link"; href: string; text: string };

const MAX_BLOCKS = 400;
const MAX_TEXT = 4000;
const MAX_ITEMS = 100;
const MAX_ROWS = 60;
const MAX_CELLS = 12;

/** Only copies in DIBAY post-images storage may be shown (never a hot-linked source image). */
export function isDibayPostImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && u.pathname.includes("/storage/v1/object/public/post-images/");
  } catch {
    return false;
  }
}

function text(v: unknown, max = MAX_TEXT): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function safeHref(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function sanitizeImportedContentBlocks(
  raw: unknown,
  isAllowedImage: (url: string) => boolean = isDibayPostImageUrl,
): ImportedContentBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportedContentBlock[] = [];
  for (const b of raw.slice(0, MAX_BLOCKS)) {
    if (!b || typeof b !== "object") continue;
    const x = b as Record<string, unknown>;
    switch (x.t) {
      case "p":
      case "quote": {
        const s = text(x.text);
        if (s) out.push({ t: x.t, text: s });
        break;
      }
      case "h": {
        const s = text(x.text, 300);
        if (s) out.push({ t: "h", level: x.level === 2 ? 2 : 3, text: s });
        break;
      }
      case "ul":
      case "ol": {
        const items = (Array.isArray(x.items) ? x.items : []).slice(0, MAX_ITEMS).map((i) => text(i, 1000)).filter(Boolean);
        if (items.length) out.push({ t: x.t, items });
        break;
      }
      case "table": {
        const rows = (Array.isArray(x.rows) ? x.rows : [])
          .slice(0, MAX_ROWS)
          .map((r) => (Array.isArray(r) ? r.slice(0, MAX_CELLS).map((c) => text(c, 500)) : []))
          .filter((r) => r.some(Boolean));
        if (rows.length) out.push({ t: "table", rows, header: x.header === true });
        break;
      }
      case "img": {
        const url = typeof x.url === "string" ? x.url.trim() : "";
        if (url && isAllowedImage(url)) out.push({ t: "img", url, alt: text(x.alt, 300) || null, caption: text(x.caption, 500) || null });
        break;
      }
      case "link": {
        const href = safeHref(x.href);
        const s = text(x.text, 300) || href;
        if (href && s) out.push({ t: "link", href, text: s });
        break;
      }
      default:
        break;
    }
  }
  return out;
}
