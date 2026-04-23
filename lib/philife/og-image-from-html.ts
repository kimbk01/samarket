/**
 * HTML 문자열에서 대표 썸네일 후보 URL 추출(og / twitter, 태그 순서 단순 매칭).
 * 서버·클라 모두에서 사용(라이브러리만, DOM 없음).
 */
export function parseOgImageFromHtmlString(html: string): string | null {
  if (!html || html.length > 2_500_000) return null;
  const patterns: RegExp[] = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const s = m[1].trim();
      if (s && !s.startsWith("data:")) return s;
    }
  }
  return null;
}

const ITEMPROP = /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["'][^>]*>/i;
const SECURE_OG = /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["'][^>]*>/i;
const PLACE_HOLDER = /(spacer|1x1|blank\.gif|clear\.gif|pixel\.(gif|png)|transparent|favicon)(["']|$)/i;

/**
 * `og:`이 없는 페이지: `itemprop`, `og:image:secure_url`, 이어서 `img`의 `src`/`data-src` 중 첫 절대 URL(휴리스틱).
 */
export function parseFallbackNewsImageFromHtmlString(html: string): string | null {
  if (!html || html.length > 2_500_000) return null;
  for (const p of [ITEMPROP, SECURE_OG]) {
    const m = html.match(p);
    if (m?.[1]) {
      const s = m[1].trim();
      if (s && !s.startsWith("data:")) {
        if (/^https?:\/\//i.test(s) || s.startsWith("//")) {
          return s.startsWith("//") ? `https:${s}` : s;
        }
        if (s.startsWith("/")) {
          return s;
        }
      }
    }
  }
  for (const re of [
    /<img[^>]+(?:\ssrc=|\sdata-src=|\sdata-original=)["'](https?:\/\/[^"']+)["'][^>]*>/i,
    /<img[^>]+(?:\ssrc=|\sdata-src=|\sdata-original=)["'](\/\/[^"']+)["'][^>]*>/i,
  ]) {
    const im = html.match(re);
    const g = im?.[1];
    if (g && !PLACE_HOLDER.test(g) && !g.startsWith("data:")) {
      if (g.startsWith("//")) return `https:${g}`;
      return g;
    }
  }
  return null;
}
