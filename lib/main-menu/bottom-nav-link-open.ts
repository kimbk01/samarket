/** 관리자 미리보기·앱 하단 탭 공통 — 상대 경로를 절대 URL로 */
export function resolveBottomNavAbsoluteHref(href: string, origin: string): string {
  const trimmed = href.trim();
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return trimmed;
}

/** 하단 탭·관리자 링크 확인 — 새 창 여부에 따라 열기 */
export function openBottomNavHref(href: string, openInNewTab: boolean, origin = typeof window !== "undefined" ? window.location.origin : ""): void {
  if (typeof window === "undefined") return;
  const url = resolveBottomNavAbsoluteHref(href, origin);
  if (openInNewTab) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(url);
}
