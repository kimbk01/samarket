import { pickImageUrlFromImgEl } from "@/lib/philife/interleaved-body-markdown";

/**
 * 외부 글 붙여넣기 HTML 정리 (Owner 승인 ① — 외부 CSS·스크립트 미실행).
 * - 실행·삽입 요소(script·style·iframe·object·svg·form 등) 제거, class·id·on* 등 속성 제거, style 은 굵게·기울임만 남김.
 * - `<img>` 는 실제 사진 주소(지연 로딩 속성 우선)를 `data-paste-src` 로 바꿔 편집기 사진 노드가 받는다 → 재호스팅.
 *   1×1·투명 픽셀·http/https·data:image 가 아닌 주소는 버린다.
 * - `<figure>` 의 `<figcaption>` 은 사진 설명(caption)으로 옮긴다.
 * 남은 구조(제목·문단·굵게·기울임·링크·목록·인용·표)는 편집기 스키마가 다시 걸러 낸다 — 스키마 밖 요소는 글자만 남는다.
 */
const DROP = "script,style,noscript,iframe,object,embed,svg,canvas,video,audio,form,input,button,select,textarea,template,link,meta,head,title";

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

export function sanitizePastedHtmlForEditor(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return "";
  body.querySelectorAll(DROP).forEach((el) => el.remove());

  body.querySelectorAll("img").forEach((img) => {
    const url = isTinyImage(img) ? null : normalizePastedImageUrl(pickImageUrlFromImgEl(img));
    if (!url) {
      img.remove();
      return;
    }
    const out = doc.createElement("img");
    out.setAttribute("data-dibay-image", "");
    out.setAttribute("data-paste-src", url);
    const alt = (img.getAttribute("alt") ?? "").trim().slice(0, 300);
    if (alt) out.setAttribute("alt", alt);
    const figure = img.closest("figure");
    const cap = figure?.querySelector("figcaption");
    if (cap && !figure?.querySelector("img[data-dibay-image][data-caption]")) {
      const text = (cap.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
      if (text) out.setAttribute("data-caption", text);
      cap.remove();
    }
    img.replaceWith(out);
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
  return body.innerHTML;
}
