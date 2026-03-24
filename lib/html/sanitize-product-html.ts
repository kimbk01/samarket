/**
 * 상품 설명용 최소 HTML 정리 (서버에서만 사용).
 * 완전한 XSS 방지는 아니며, 스크립트·이벤트 핸들러·javascript: URL을 제거합니다.
 */
export function sanitizeProductHtml(html: string, maxLen = 200_000): string {
  if (html == null || typeof html !== "string") return "";
  let s = html.slice(0, maxLen);
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  s = s.replace(/<\/script>/gi, "");
  s = s.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/javascript:/gi, "");
  s = s.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
  return s.trim();
}
