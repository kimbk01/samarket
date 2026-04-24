/**
 * 헤더 메신저 아이콘이 **URL 이동 대신** 풀뷰포트 스택(`PhilifeMessengerFromHeaderStack`)을 쓰는 표면.
 * 필라이프 피드·거래 홈·거래 마켓 목록과 동일 UX.
 */
export function isMessengerFromHeaderStackSurface(pathname: string | null | undefined): boolean {
  const p = (pathname?.split("?")[0] ?? "").trim();
  if (p === "/philife") return true;
  if (p === "/home") return true;
  if (p === "/market") return true;
  if (p.startsWith("/market/")) return true;
  return false;
}
