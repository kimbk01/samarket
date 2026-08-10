import { normalizeHttpUrlString } from "@/lib/philife/http-url-string";

const IMG_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * 본문/요약에 남은 **단독 이미지 URL** (확장자·post-images 스토리지).
 * 붙여넣기 실패·plain 경로에서 마크다운 없이 URL이 남는 경우 리스트 노출 방지.
 */
const BARE_IMAGE_URL_RE =
  /https?:\/\/[^\s<>"'`)\]]+?\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s<>"'`)\]]*)?/gi;
const POST_IMAGES_STORAGE_URL_RE =
  /https?:\/\/[^\s<>"'`)\]]+?\/storage\/v1\/object\/public\/post-images\/[^\s<>"'`)\]]+/gi;
const TRUNCATED_MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\([^)]*$/g;

function removeImageReferences(s: string): string {
  return s
    .replace(IMG_RE, " ")
    .replace(TRUNCATED_MARKDOWN_IMAGE_RE, " ")
    .replace(POST_IMAGES_STORAGE_URL_RE, " ")
    .replace(BARE_IMAGE_URL_RE, " ");
}

/**
 * 피드 목록 등: 본문의 `![…](https…)` 및 단독 이미지/스토리지 URL을 미리보기에서 제거.
 * (URL이 텍스트로 노출되지 않게)
 */
export function stripMarkdownImageSyntaxForFeedPreview(s: string): string {
  if (!s) return "";
  let t = removeImageReferences(s);
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/**
 * 글쓰기 본문용: 이미지 참조만 제거하고 문단/줄바꿈은 보존합니다.
 * 이미지 파일과 HTML이 함께 오는 클립보드에서도 텍스트 본문을 잃지 않게 합니다.
 */
export function stripImageReferencesPreservingParagraphs(s: string): string {
  if (!s) return "";
  return removeImageReferences(s)
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/ *\r?\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 모든 community_posts writer/read path가 공유하는 리스트 요약 SSOT */
export function summarizeCommunityPostContent(text: string, max = 160): string {
  const plain = stripMarkdownImageSyntaxForFeedPreview(text);
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max)}…`;
}

/** 알려진 이미지 URL(호스팅 결과 등)을 본문 텍스트에서 제거 */
export function stripKnownImageUrlsFromText(text: string, urls: string[]): string {
  if (!text) return "";
  let s = text;
  const ordered = [...urls]
    .map((u) => (u ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const u of ordered) {
    if (!s.includes(u)) continue;
    s = s.split(u).join(" ");
  }
  return s
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/ *\r?\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** plain 클립보드가 이미지 URL만인지 (파일 붙여넣기 시 본문에 넣지 않음) */
export function isPlainClipboardMostlyImageUrls(plain: string): boolean {
  const t = (plain ?? "").trim();
  if (!t) return true;
  const without = stripMarkdownImageSyntaxForFeedPreview(t);
  return without.length === 0;
}

const BLANK = /(spacer|1x1|blank\.gif|pixel|favicon|clear\.gif)/i;

const LAZY = [
  "data-src", "data-lazy-src", "data-original", "data-url", "data-cfsrc", "data-large_image",
] as const;

function pickImageUrlFromImgEl(img: HTMLImageElement): string {
  for (const a of LAZY) {
    const v = img.getAttribute(a);
    if (v && v.trim() && !BLANK.test(v)) {
      return normalizeHttpUrlString(v.replace(/\s/g, "").trim());
    }
  }
  const s = img.getAttribute("src");
  if (!s || !s.trim() || BLANK.test(s)) return "";
  const raw = s.trim();
  /** 클립보드 HTML 의 data: 이미지도 교차 본문에 포함(이후 rehost) */
  if (/^data:image\/(jpeg|jpg|png|webp|gif)/i.test(raw)) {
    return raw;
  }
  if (/^data:/i.test(raw)) return "";
  return raw;
}

/**
 * 읽기 화면: 본문이 마크다운 `![](https...)` 를 포함하는지(교차 본문).
 */
export function hasInterleavedMarkdownImageSyntax(content: string | null | undefined): boolean {
  if (!content) return false;
  IMG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_RE.exec(content)) !== null) {
    const u = (m[2] ?? "").trim();
    if (u.startsWith("data:image/")) return true;
    try {
      const n = u.startsWith("//") ? new URL("https:" + u) : new URL(normalizeHttpUrlString(u));
      if (n.protocol === "http:" || n.protocol === "https:") return true;
    } catch {
      /* */
    }
  }
  return false;
}

/**
 * 제출·동기화용: 본문에 등장한 이미지 URL(순서) — `![](` 만 인정.
 */
export function extractImageUrlsFromInterleavedContent(content: string | null | undefined): string[] {
  if (!content) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  IMG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_RE.exec(content)) !== null) {
    const raw = (m[2] ?? "").trim();
    if (!raw) continue;
    let u: string;
    if (raw.startsWith("//")) u = "https:" + raw;
    else u = raw.startsWith("data:") ? raw : normalizeHttpUrlString(raw);
    if (seen.has(u)) continue;
    if (!raw.startsWith("data:") && (raw.startsWith("https:") || raw.startsWith("http:") || raw.startsWith("//"))) {
      seen.add(u);
      out.push(u);
    } else if (raw.startsWith("data:image/")) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

type Seg = { kind: "text" | "img"; value: string };

/**
 * `![](url)` + 일반 문단을 순서대로 쪼개 읽기용(클라이언트 `ReactNode` 는 컴포넌트에서).
 */
export function parseInterleavedMarkdownToSegments(text: string): Seg[] {
  if (!text) return [];
  const segs: Seg[] = [];
  let last = 0;
  IMG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_RE.exec(text)) !== null) {
    if (m.index > last) {
      segs.push({ kind: "text", value: text.slice(last, m.index) });
    }
    segs.push({ kind: "img", value: m[2]!.trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const t = text.slice(last);
    if (t) segs.push({ kind: "text", value: t });
  }
  if (segs.length === 0) segs.push({ kind: "text", value: text });
  return segs;
}

/**
 * HTML 붙여넣기 → `![](url)` 이 본문 순서를 따르는 마크다운(텍스트·이미지 교차).
 * 클라이언트 전용(DOMParser).
 */
export function interleavedMarkdownFromPastedHtml(html: string, plainFallback: string): string {
  if (!html.trim() || typeof document === "undefined") {
    return plainFallback;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return plainFallback;
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "IFRAME"]);
  const textBuf: string[] = [];
  const blocks: (string | { t: "img"; url: string })[] = [];
  /** 뛰어쓰기·빈 줄(세로)은 그대로, 캐리지·과도한 빈 줄만 가볍게 정리 */
  const flushT = () => {
    const raw = textBuf.join("").replace(/\r\n/g, "\n");
    const t = raw.replace(/\n{12,}/g, "\n\n\n\n\n\n");
    if (t.length) {
      blocks.push(t);
    }
    textBuf.length = 0;
  };

  /** P·제목·인용·요약: 문단 끝 (래퍼 DIV/SECTION/ARTICLE 은 끼우지 않음 — 중첩 이중 공백 방지) */
  const trailingDouble = new Set(
    "P H1 H2 H3 H4 H5 H6 BLOCKQUOTE FIGCAPTION CAPTION SUMMARY".split(" "),
  );
  const trailingSingle = new Set(
    "LI TR DT DD FIGURE ADDRESS TH TD HEADER FOOTER".split(" "),
  );

  function walk(n: Node) {
    if (n instanceof HTMLBRElement) {
      textBuf.push("\n");
      return;
    }
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el0 = n as Element;
      if (el0.tagName === "BR" || el0.tagName === "WBR") {
        if (el0.tagName === "BR") {
          textBuf.push("\n");
        }
        return;
      }
    }
    if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === "IMG") {
      flushT();
      let u = pickImageUrlFromImgEl(n as HTMLImageElement);
      if (u) {
        if (u.startsWith("//")) u = `https:${u}`;
        if (
          u.startsWith("https:") ||
          u.startsWith("http:") ||
          /^data:image\/(jpeg|jpg|png|webp|gif)/i.test(u)
        ) {
          blocks.push({ t: "img", url: u });
        }
      }
      return;
    }
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element;
      if (skip.has(el.tagName)) {
        return;
      }
      if (el.tagName === "PRE") {
        flushT();
        const inner = (n as HTMLPreElement).textContent ?? "";
        if (inner.length) {
          blocks.push(inner.replace(/\r\n/g, "\n"));
        }
        return;
      }
      if (el.tagName === "HR") {
        flushT();
        textBuf.push("\n\n");
        return;
      }
      for (const c of Array.from(n.childNodes)) {
        walk(c);
      }
      if (trailingDouble.has(el.tagName)) {
        textBuf.push("\n\n");
        return;
      }
      if (trailingSingle.has(el.tagName)) {
        textBuf.push("\n");
        return;
      }
      return;
    }
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent ?? "";
      if (t) {
        textBuf.push(t);
      }
      return;
    }
    for (const c of Array.from(n.childNodes)) {
      walk(c);
    }
  }

  walk(body);
  flushT();

  if (blocks.length === 0) return plainFallback;
  return blocks
    .map((b) => (typeof b === "string" ? b : `![](${b.url})`))
    .join("\n\n");
}

/**
 * `extractOrderedPasted...` 를 대체: 인터리브 `md` 에서 이미지 작업 목록.
 */
/** `![](from)` → `![](to)` (data URL·긴 문자열도 안전히 한 번씩) */
export function applyInterleavedImageUrlReplacements(
  md: string,
  pairs: { from: string; to: string }[]
): string {
  let s = md;
  const ordered = [...pairs]
    .filter((p) => p.from && p.to && p.from !== p.to)
    .sort((a, b) => b.from.length - a.from.length);
  for (const { from, to } of ordered) {
    if (!s.includes(from)) continue;
    const needle = `](${from})`;
    if (s.includes(needle)) {
      s = s.split(needle).join(`](${to})`);
    }
  }
  return s;
}

export function workItemsFromInterleavedMd(md: string): { kind: "data" | "http"; value: string }[] {
  const out: { kind: "data" | "http"; value: string }[] = [];
  const seen = new Set<string>();
  IMG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_RE.exec(md)) !== null) {
    const raw = (m[2] ?? "").trim();
    if (!raw) continue;
    if (raw.startsWith("data:image/")) {
      if (!seen.has(raw)) {
        seen.add(raw);
        out.push({ kind: "data", value: raw });
      }
    } else {
      const u = normalizeHttpUrlString(raw.replace(/\s/g, "").trim());
      if (/^https?:\/\//i.test(u) || u.startsWith("//")) {
        const f = u.startsWith("//") ? `https:${u}` : u;
        if (seen.has(f)) continue;
        seen.add(f);
        out.push({ kind: "http", value: f });
      }
    }
  }
  return out;
}
