function normalizeStoreOwnerPath(pathname?: string | null): string {
  const raw =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");
  return raw.split("?")[0]?.trim().replace(/\/+$/, "") ?? "";
}

/** `/stores/owner` 허브(쿼리만 다른 동일 화면) — 성능·배지 API 억제 판별 */
export function isStoreOwnerHubPathname(pathname?: string | null): boolean {
  return normalizeStoreOwnerPath(pathname) === "/stores/owner";
}

/** `/stores/owner` 및 하위 운영 라우트 — 전역 부트·게이트·통화 설정 지연 */
export function isStoreOwnerAdminPathname(pathname?: string | null): boolean {
  const p = normalizeStoreOwnerPath(pathname);
  return p === "/stores/owner" || p.startsWith("/stores/owner/");
}

/** 주소록 `returnTo` — 매장 운영 화면으로 돌아갈 때 대표 주소 PATCH 금지 */
export function isStoreOwnerAdminReturnTo(returnTo: string): boolean {
  const raw = returnTo.trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return false;
  const pathOnly = raw.split("?")[0] ?? "";
  return isStoreOwnerAdminPathname(pathOnly);
}
