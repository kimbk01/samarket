import { normalizeHttpUrlString } from "@/lib/philife/http-url-string";
import { parseOgImageFromHtmlString } from "@/lib/philife/og-image-from-html";

/**
 * 본문 첫 줄·행에 있는 기사/페이지 URL (og 이미지 폴백·Referer에 사용)
 */
export function firstLikelyArticlePageUrl(plain: string): string | null {
  const lines = plain
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const firstToken = line.split(/\s/)[0] ?? line;
    if (/^https?:\/\//i.test(firstToken)) {
      try {
        const u = new URL(firstToken);
        if (u.protocol === "http:" || u.protocol === "https:") return u.href;
      } catch {
        /* */
      }
    }
    if (/^www\./i.test(firstToken)) {
      return normalizeHttpUrlString(firstToken);
    }
  }
  return null;
}

function firstFromSrcset(s: string): string | null {
  const part = s.split(",")[0]?.trim() ?? "";
  const url = part.split(/\s+/)[0]?.trim();
  return url || null;
}

const LAZY_ATTRS = [
  "data-src",
  "data-lazy-src",
  "data-original",
  "data-url",
  "data-cfsrc",
  "data-deferred",
  "data-image",
  "data-img",
  "data-lazy",
  "data-large_image",
  "data-orig-src",
  "data-orig",
];

function isSrcPlaceholder(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^data:image\/(gif|png|jpeg|webp);base64,/i.test(t) && t.length < 500) return true;
  return /spacer|blank\.gif|1x1|pixel\.(gif|png)|clear\.gif|empty\.gif/i.test(t);
}

function pickRawUrlFromImg(img: HTMLImageElement): string {
  for (const a of LAZY_ATTRS) {
    const v = img.getAttribute(a);
    if (v && v.trim() && !isSrcPlaceholder(v)) {
      return v.trim();
    }
  }
  const dss = img.getAttribute("data-srcset") || img.getAttribute("data-src-set");
  if (dss) {
    const u = firstFromSrcset(dss);
    if (u && !isSrcPlaceholder(u)) return u;
  }
  const s = img.getAttribute("src");
  if (s && s.trim() && !isSrcPlaceholder(s)) {
    return s.trim();
  }
  return "";
}

function findBaseForRelative(doc: Document, plain: string): string {
  const b = doc.querySelector("base[href]")?.getAttribute("href");
  if (b) {
    try {
      return new URL(b, "https://example.com/").href;
    } catch {
      /* */
    }
  }
  const first = plain.split(/\r?\n/)[0]?.trim() ?? "";
  if (first) {
    if (/^https?:\/\//i.test(first)) {
      try {
        return new URL(first).href;
      } catch {
        /* */
      }
    }
    if (/^www\./i.test(first)) {
      return normalizeHttpUrlString(first);
    }
  }
  const a = doc.querySelector('a[href^="http"]')?.getAttribute("href");
  if (a) {
    try {
      return new URL(a).origin + "/";
    } catch {
      /* */
    }
  }
  return "https://invalid.local/";
}

function resolveToHttp(s: string, base: string): { kind: "data" | "http"; value: string } | null {
  const t = s.trim();
  if (!t) return null;
  if (t.startsWith("data:image/")) {
    return { kind: "data", value: t };
  }
  try {
    if (t.startsWith("//")) {
      return { kind: "http", value: `https:${t}` };
    }
    if (/^https?:\/\//i.test(t)) {
      return { kind: "http", value: t };
    }
    const r = new URL(t, base);
    if (r.protocol === "http:" || r.protocol === "https:") {
      return { kind: "http", value: r.href };
    }
  } catch {
    /* */
  }
  return null;
}

/**
 * 클립보드 HTML + plain 텍스트에서 이미지 소스를 **문서/메타 우선** 순서로 수집합니다.
 */
export function extractOrderedPastedImageSources(
  html: string,
  plain: string
): { kind: "data" | "http"; value: string }[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: { kind: "data" | "http"; value: string }[] = [];
  const seen = new Set<string>();
  const base = findBaseForRelative(doc, plain);

  const push = (item: { kind: "data" | "http"; value: string } | null) => {
    if (!item) return;
    if (seen.has(item.value)) return;
    seen.add(item.value);
    out.push(item);
  };

  const ogMeta =
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="twitter:image:src"]')?.getAttribute("content");
  if (ogMeta) {
    push(resolveToHttp(ogMeta, base));
  } else {
    const fromString = parseOgImageFromHtmlString(html);
    if (fromString) {
      push(resolveToHttp(fromString, base));
    }
  }

  for (const el of doc.querySelectorAll("img")) {
    const raw = pickRawUrlFromImg(el);
    if (!raw) continue;
    push(resolveToHttp(raw, base));
  }

  return out;
}
