/**
 * Structured body of an imported community post (`community_posts.content_blocks`).
 * The plain `content` column stays the authority for summary/search/feed; these blocks only let the
 * detail page show the original structure (headings, lists, quotes, tables, captions, links) in
 * DIBAY styling. No HTML, no CSS, no scripts from the source ever reach the page.
 * Sanitized when written (publish) and again when read (detail) — pure, unit-tested.
 */

/**
 * 문단 안 서식 조각 (회원 글 서식 — 2026-10-31 Owner 승인 ①). 가져온 글은 runs 없이 `text` 만 쓴다.
 * `text` 는 항상 runs 를 이어 붙인 평문과 같다(검색·요약·이전 렌더러 호환).
 */
export type RichRun = { text: string; b?: true; i?: true; href?: string };

export type ImportedContentBlock =
  | { t: "p"; text: string; runs?: RichRun[] }
  | { t: "h"; level: 2 | 3; text: string }
  | { t: "ul" | "ol"; items: string[]; itemRuns?: RichRun[][] }
  | { t: "quote"; text: string; runs?: RichRun[] }
  | { t: "table"; rows: string[][]; header: boolean }
  | { t: "img"; url: string; alt: string | null; caption: string | null }
  | { t: "link"; href: string; text: string };

const MAX_BLOCKS = 400;
const MAX_TEXT = 4000;
const MAX_ITEMS = 100;
const MAX_ROWS = 60;
const MAX_CELLS = 12;
const MAX_RUNS = 200;

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

/** 조각 글자 — 공백은 접되 앞뒤를 자르지 않는다(조각 사이 띄어쓰기 보존). 줄바꿈은 회원 문단만 유지. */
function runText(v: unknown): string {
  return typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").slice(0, MAX_TEXT) : "";
}

function sanitizeRuns(raw: unknown): RichRun[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RichRun[] = [];
  let total = 0;
  for (const r of raw.slice(0, MAX_RUNS)) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const t = runText(x.text);
    if (!t) continue;
    const room = MAX_TEXT - total;
    if (room <= 0) break;
    const run: RichRun = { text: t.slice(0, room) };
    if (x.b === true) run.b = true;
    if (x.i === true) run.i = true;
    const href = safeHref(x.href);
    if (href) run.href = href;
    total += run.text.length;
    const prev = out[out.length - 1];
    if (prev && prev.b === run.b && prev.i === run.i && prev.href === run.href) prev.text += run.text;
    else out.push(run);
  }
  /** 앞뒤 공백·줄바꿈 정리 */
  while (out.length && !out[0]!.text.replace(/^\s+/, "")) out.shift();
  if (out.length) out[0]!.text = out[0]!.text.replace(/^\s+/, "");
  while (out.length && !out[out.length - 1]!.text.replace(/\s+$/, "")) out.pop();
  if (out.length) out[out.length - 1]!.text = out[out.length - 1]!.text.replace(/\s+$/, "");
  return out.length ? out : null;
}

function runsPlainText(runs: readonly RichRun[]): string {
  return runs.map((r) => r.text).join("");
}

/** 서식이 실제로 있는 조각만 남긴다 — 서식 없는 한 조각이면 runs 를 저장하지 않는다(중복 저장 방지) */
function meaningfulRuns(runs: RichRun[] | null): RichRun[] | undefined {
  if (!runs) return undefined;
  return runs.some((r) => r.b || r.i || r.href) ? runs : undefined;
}

export type ContentBlockSanitizeOptions = {
  isAllowedImage?: (url: string) => boolean;
  /** 회원 글: 문단 서식 조각(runs)·문단 안 줄바꿈 허용 */
  allowRuns?: boolean;
};

export function sanitizeImportedContentBlocks(
  raw: unknown,
  isAllowedImageOrOptions: ((url: string) => boolean) | ContentBlockSanitizeOptions = isDibayPostImageUrl,
): ImportedContentBlock[] {
  const opts: ContentBlockSanitizeOptions =
    typeof isAllowedImageOrOptions === "function" ? { isAllowedImage: isAllowedImageOrOptions } : isAllowedImageOrOptions;
  const isAllowedImage = opts.isAllowedImage ?? isDibayPostImageUrl;
  const allowRuns = opts.allowRuns === true;
  if (!Array.isArray(raw)) return [];
  const out: ImportedContentBlock[] = [];
  for (const b of raw.slice(0, MAX_BLOCKS)) {
    if (!b || typeof b !== "object") continue;
    const x = b as Record<string, unknown>;
    switch (x.t) {
      case "p":
      case "quote": {
        if (allowRuns) {
          const runs = sanitizeRuns(x.runs) ?? sanitizeRuns([{ text: x.text }]);
          if (!runs) break;
          const keep = meaningfulRuns(runs);
          out.push(keep ? { t: x.t, text: runsPlainText(runs), runs: keep } : { t: x.t, text: runsPlainText(runs) });
          break;
        }
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
        if (allowRuns && Array.isArray(x.itemRuns)) {
          const runsList = x.itemRuns
            .slice(0, MAX_ITEMS)
            .map((r) => sanitizeRuns(r))
            .filter((r): r is RichRun[] => Boolean(r));
          if (!runsList.length) break;
          const items = runsList.map((r) => runsPlainText(r).replace(/\s+/g, " ").slice(0, 1000));
          const keep = runsList.some((r) => meaningfulRuns(r));
          out.push(keep ? { t: x.t, items, itemRuns: runsList } : { t: x.t, items });
          break;
        }
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

/* ── 회원 글 서식 본문 (Owner 승인 ① · 2026-10-31) ─────────────────────────────────────── */

/** 회원 글 블록 정제 — DIBAY post-images 사진만, 서식 조각 허용. 소유 폴더 검사는 `resolveMemberPostImages` 가 맡는다. */
export function sanitizeMemberContentBlocks(raw: unknown): ImportedContentBlock[] {
  return sanitizeImportedContentBlocks(raw, { allowRuns: true });
}

function imageAltForMarkdown(alt: string | null): string {
  return (alt ?? "").replace(/[\[\]\n]/g, " ").trim();
}

/**
 * 블록 → `content` 평문 (서버가 만든다 — 요약 트리거·검색·해시태그·관리자 textarea 의 원천).
 * 사진은 독립 줄 `![alt](url)` 로 남겨 `images` SSOT(`mergePostBodyImages`)가 본문 순서를 그대로 읽는다.
 */
export function contentFromRichBlocks(blocks: readonly ImportedContentBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case "p":
      case "quote":
      case "h":
        parts.push(b.text);
        break;
      case "ul":
        parts.push(b.items.map((i) => `• ${i}`).join("\n"));
        break;
      case "ol":
        parts.push(b.items.map((i, n) => `${n + 1}. ${i}`).join("\n"));
        break;
      case "table":
        parts.push(b.rows.map((r) => r.join(" | ")).join("\n"));
        break;
      case "img":
        parts.push(`![${imageAltForMarkdown(b.alt)}](${b.url})${b.caption ? `\n${b.caption}` : ""}`);
        break;
      case "link":
        parts.push(b.text === b.href ? b.href : `${b.text} ${b.href}`);
        break;
    }
  }
  return parts.join("\n\n").trim();
}

/** 블록 안 사진 주소(본문 순서) */
export function richBlocksImageUrls(blocks: readonly ImportedContentBlock[]): string[] {
  return blocks.filter((b): b is Extract<ImportedContentBlock, { t: "img" }> => b.t === "img").map((b) => b.url);
}

/**
 * 평문 `content` 만으로 같은 모양을 낼 수 있으면 블록을 저장하지 않는다(중복 저장 방지).
 * 문단·사진(캡션·서식 없음)뿐이면 평문으로 충분하다.
 */
export function richBlocksNeedStorage(blocks: readonly ImportedContentBlock[]): boolean {
  return blocks.some(
    (b) =>
      (b.t !== "p" && b.t !== "img") ||
      (b.t === "p" && Boolean(b.runs?.length)) ||
      (b.t === "img" && Boolean(b.caption))
  );
}
