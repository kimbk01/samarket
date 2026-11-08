/**
 * 메신저 말풍선 본문 → 「글자 / 링크」 조각 (client-safe · 순수 함수).
 *
 * - 인정 형식: `http://`·`https://` 로 시작하거나 `www.` 로 시작하는 주소만. 그 외 스킴(javascript: 등)은 링크로 만들지 않는다.
 * - 주소 글자는 URL 에 쓰는 ASCII 글자만 — 바로 뒤에 붙은 한글(「https://a.com에서」)은 링크에서 뺀다.
 * - 끝에 붙은 문장부호(`. , ; : ! ? ' "`)와 짝이 안 맞는 닫는 괄호는 링크에서 뺀다.
 * - `www.` 주소의 href 는 `https://` 를 붙인다. 화면 글자는 원문 그대로.
 */

export type MessageTextSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

const LINK_START_RE = /(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;

const TRAILING_PUNCT = new Set([".", ",", ";", ":", "!", "?", "'", '"']);
const CLOSE_TO_OPEN: Record<string, string> = { ")": "(", "]": "[" };

function countChar(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n += 1;
  return n;
}

function trimLinkTail(raw: string): string {
  let s = raw;
  for (;;) {
    const last = s.slice(-1);
    if (!last) return s;
    if (TRAILING_PUNCT.has(last)) {
      s = s.slice(0, -1);
      continue;
    }
    const open = CLOSE_TO_OPEN[last];
    if (open && countChar(s, last) > countChar(s, open)) {
      s = s.slice(0, -1);
      continue;
    }
    return s;
  }
}

function hrefFor(text: string): string | null {
  const href = /^www\./i.test(text) ? `https://${text}` : text;
  // 스킴 뒤나 `www.` 뒤에 호스트 글자가 하나도 없으면 링크가 아니다.
  const host = href.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] ?? "";
  if (!host || /^www\.?$/i.test(host)) return null;
  return href;
}

export function splitMessageTextLinks(content: string): MessageTextSegment[] {
  const text = String(content ?? "");
  const out: MessageTextSegment[] = [];
  let cursor = 0;
  const pushText = (s: string) => {
    if (!s) return;
    const prev = out[out.length - 1];
    if (prev && prev.kind === "text") prev.text += s;
    else out.push({ kind: "text", text: s });
  };
  for (const match of text.matchAll(LINK_START_RE)) {
    const start = match.index ?? 0;
    // 단어 중간에서 시작하는 `www.`·`http` 는 주소가 아니다(예: `awww.`, `xhttp://`).
    const before = start > 0 ? text[start - 1]! : "";
    if (before && /[A-Za-z0-9_]/.test(before)) continue;
    const linkText = trimLinkTail(match[0] ?? "");
    const href = linkText ? hrefFor(linkText) : null;
    if (!href) continue;
    pushText(text.slice(cursor, start));
    out.push({ kind: "link", text: linkText, href });
    cursor = start + linkText.length;
  }
  pushText(text.slice(cursor));
  return out;
}
