/**
 * 메인 1단·라우트 규칙용 — 쿼리 제거 후 끝 슬래시 정리.
 * `/philife/uuid/` 처럼 trailing slash 가 있으면 tier1 매칭이 실패해 "SAMarket" 폴백이 뜨는 문제 방지.
 */
export function normalizeAppPathnameForTier1(pathname: string | null | undefined): string {
  const raw = typeof pathname === "string" ? pathname : "";
  const noQuery = raw.split("?")[0]!.trim();
  if (!noQuery || noQuery === "/") return "/";
  const stripped = noQuery.replace(/\/+$/, "");
  return stripped || "/";
}
