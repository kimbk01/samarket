import { pickImageUrlFromImgEl } from "@/lib/philife/interleaved-body-markdown";

/**
 * 외부 글 붙여넣기 HTML 정리 (Owner 승인 ① — 외부 CSS·스크립트 미실행).
 * - 실행·삽입 요소(script·style·iframe·object·svg·form 등) 제거, class·id·on* 등 속성 제거, style 은 굵게·기울임만 남김.
 * - `<button>` 은 껍데기만 벗긴다 — 안의 사진·글은 남긴다(사진을 누르는 단추로 감싼 사이트, 감사 2026-11-20 C).
 * - 사진은 `data-paste-src` 를 단 `<img data-dibay-image>` 로 바꿔 편집기 사진 노드가 받는다 → 재호스팅.
 *   · `<img>`: 지연 로딩 속성 → src → srcset → `<picture><source>` (`pickImageUrlFromImgEl`)
 *   · 사진 파일 주소에 걸린 링크 중 글자가 주소 그대로(또는 비어 있음)인 것 (감사 A3)
 *   · 글자가 사진 파일 주소 하나뿐인 줄(문단) (감사 A1 의 HTML 모양)
 *   · 글자 없이 크기만 있는 칸의 CSS 배경 사진 (감사 H)
 *   1×1·투명 픽셀은 버린다. 상대 주소·blob 처럼 서버가 가져올 수 없는 사진은 버리고 `unfetchable` 로 센다(조용히 버리지 않게).
 * - `<figure>` 의 `<figcaption>` 은 사진 설명(caption)으로 옮긴다.
 * 남은 구조(제목·문단·굵게·기울임·링크·목록·인용·표)는 편집기 스키마가 다시 걸러 낸다 — 스키마 밖 요소는 글자만 남는다.
 */
const DROP = "script,style,noscript,iframe,object,embed,svg,canvas,video,audio,form,input,select,textarea,template,link,meta,head,title";

/** 사진 파일 주소 — 주소 경로가 사진 확장자로 끝난다(물음표 뒤는 보지 않음). 서버가 파일 내용으로 다시 판정한다. */
const IMAGE_FILE_PATH = /\.(?:jpe?g|png|webp|gif|heic|heif)$/i;

export function isImageFileUrl(raw: string): boolean {
  const t = (raw ?? "").trim();
  if (!/^https?:\/\//i.test(t)) return false;
  try {
    return IMAGE_FILE_PATH.test(new URL(t).pathname);
  } catch {
    return false;
  }
}

/**
 * 글자만 붙여넣은 클립보드: 줄 전체가 사진 파일 주소이거나 `[글](사진 파일 주소)` 인 줄을 사진 문법 `![글](주소)` 로 바꾼다.
 * 확장자가 없는 주소·문장 속 링크는 그대로 둔다(사진인지 확인하려고 서버 요청을 늘리지 않는다).
 */
export function plainImageLinesToMarkdown(plain: string): string {
  return (plain ?? "")
    .split(/(\r?\n)/)
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("![")) return line;
      if (isImageFileUrl(t)) return `![](${t})`;
      const m = /^\[([^\]]*)\]\((\S+)\)$/.exec(t);
      if (m && isImageFileUrl(m[2] ?? "")) return `![${(m[1] ?? "").trim()}](${m[2]})`;
      return line;
    })
    .join("");
}

function isTinyImage(img: HTMLImageElement): boolean {
  const w = Number(img.getAttribute("width") ?? "");
  const h = Number(img.getAttribute("height") ?? "");
  return (Number.isFinite(w) && w > 0 && w <= 2) || (Number.isFinite(h) && h > 0 && h <= 2);
}

function normalizePastedImageUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^data:image\/(jpeg|jpg|png|webp|gif);/i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  return /^https?:\/\//i.test(t) ? t : null;
}

function unwrap(el: Element) {
  el.replaceWith(...Array.from(el.childNodes));
}

const textOf = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** 줄(문단) 안에 글자 서식·링크·줄바꿈 말고 다른 요소가 없는가 */
const INLINE_ONLY = new Set(["A", "SPAN", "B", "STRONG", "I", "EM", "U", "BR", "FONT"]);
function hasOnlyInlineChildren(el: Element): boolean {
  return Array.from(el.querySelectorAll("*")).every((c) => INLINE_ONLY.has(c.tagName));
}

const BG_URL = /background(?:-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i;

function hasBoxSize(el: Element): boolean {
  const st = (el.getAttribute("style") ?? "").toLowerCase();
  return /(^|;)\s*(width|height|min-height|aspect-ratio)\s*:/.test(st) || el.hasAttribute("width") || el.hasAttribute("height");
}

export type PastedHtmlAnalysis = {
  html: string;
  /** 편집기에 들어갈(가져오기 대기) 사진 주소 — 글 안 순서 */
  imageUrls: string[];
  /** 서버가 가져올 수 없어 뺀 사진 수(상대 주소·blob 등) */
  unfetchable: number;
};

export function analyzePastedHtmlForEditor(html: string): PastedHtmlAnalysis {
  if (typeof DOMParser === "undefined") return { html, imageUrls: [], unfetchable: 0 };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return { html: "", imageUrls: [], unfetchable: 0 };
  body.querySelectorAll(DROP).forEach((el) => el.remove());
  body.querySelectorAll("button").forEach((el) => unwrap(el));

  let unfetchable = 0;
  const makeImage = (url: string, alt?: string | null) => {
    const out = doc.createElement("img");
    out.setAttribute("data-dibay-image", "");
    out.setAttribute("data-paste-src", url);
    const a = (alt ?? "").trim().slice(0, 300);
    if (a) out.setAttribute("alt", a);
    return out;
  };

  body.querySelectorAll("img").forEach((img) => {
    if (isTinyImage(img)) {
      img.remove();
      return;
    }
    const picked = pickImageUrlFromImgEl(img);
    const url = normalizePastedImageUrl(picked);
    if (!url) {
      if (picked.trim()) unfetchable += 1;
      img.remove();
      return;
    }
    const out = makeImage(url, img.getAttribute("alt"));
    const figure = img.closest("figure");
    const cap = figure?.querySelector("figcaption");
    if (cap && !figure?.querySelector("img[data-dibay-image][data-caption]")) {
      const text = textOf(cap).slice(0, 500);
      if (text) out.setAttribute("data-caption", text);
      cap.remove();
    }
    img.replaceWith(out);
  });

  /** 사진 파일 주소 링크 — 글자가 주소 그대로이거나 비어 있을 때만(다른 글자가 있으면 링크로 둔다) */
  body.querySelectorAll("a[href]").forEach((a) => {
    const href = (a.getAttribute("href") ?? "").trim();
    if (!isImageFileUrl(href) || a.querySelector("img")) return;
    const text = textOf(a);
    if (text && text !== href) return;
    a.replaceWith(makeImage(href));
  });

  /** 글자가 사진 파일 주소 하나뿐인 줄 */
  body.querySelectorAll("p, div").forEach((el) => {
    if (!el.isConnected || el.querySelector("img") || !hasOnlyInlineChildren(el)) return;
    const text = textOf(el);
    if (!text || /\s/.test(text) || !isImageFileUrl(text)) return;
    el.replaceWith(makeImage(text));
  });

  /** 글자 없이 크기만 있는 칸의 CSS 배경 사진 */
  body.querySelectorAll("[style]").forEach((el) => {
    if (!el.isConnected || el.tagName === "IMG") return;
    const m = BG_URL.exec(el.getAttribute("style") ?? "");
    if (!m || textOf(el) || el.querySelector("img") || !hasBoxSize(el)) return;
    const url = normalizePastedImageUrl(m[1] ?? "");
    if (!url) {
      unfetchable += 1;
      return;
    }
    el.replaceWith(makeImage(url));
  });

  const all = body.querySelectorAll("*");
  all.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === "style") {
        /** 굵게·기울임 판정에 필요한 선언만 남긴다(구글 문서 등 span 서식) — 색·글꼴·크기는 버림 */
        const st = (el as HTMLElement).style;
        const fw = st.fontWeight;
        const fs = st.fontStyle;
        el.removeAttribute("style");
        if (fw) (el as HTMLElement).style.fontWeight = fw;
        if (fs) (el as HTMLElement).style.fontStyle = fs;
        continue;
      }
      const keep =
        (el.tagName === "A" && name === "href") ||
        (el.tagName === "IMG" && (name === "data-dibay-image" || name === "data-paste-src" || name === "alt" || name === "data-caption")) ||
        ((el.tagName === "TD" || el.tagName === "TH") && (name === "colspan" || name === "rowspan"));
      if (!keep) el.removeAttribute(attr.name);
    }
    if (el.tagName === "A") {
      const href = el.getAttribute("href") ?? "";
      if (!/^https?:\/\//i.test(href.trim())) el.removeAttribute("href");
    }
  });
  const imageUrls = Array.from(body.querySelectorAll("img[data-dibay-image]")).map((el) => el.getAttribute("data-paste-src") ?? "");
  return { html: body.innerHTML, imageUrls, unfetchable };
}

export function sanitizePastedHtmlForEditor(html: string): string {
  return analyzePastedHtmlForEditor(html).html;
}
