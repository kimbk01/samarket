/**
 * 거래 탐색 표면(`/home`, `/market/…`)에서 글쓰기 시트에 넘길 `?category=` 와 동일한 값(거래는 UUID).
 */
export function buildTradeWriteInitialCategoryFromPathname(pathname: string | null | undefined): string {
  const clean = (pathname?.split("?")[0] ?? "").trim();
  if (!clean.startsWith("/market/")) return "";
  const m = clean.match(/^\/market\/([^/]+)$/);
  if (!m?.[1]) return "";
  try {
    return decodeURIComponent(m[1]).normalize("NFC");
  } catch {
    return m[1].normalize("NFC");
  }
}
