/** `/stores/owner` 허브 및 하위 운영 경로 — 신청(`/stores/owner/apply`) 제외 */

export function normalizeOwnerStackPath(path: string | null | undefined): string {
  return String(path ?? "").split("?")[0]?.trim() ?? "";
}

export function isStoresOwnerStackPath(path: string | null | undefined): boolean {
  const p = normalizeOwnerStackPath(path);
  if (p === "/stores/owner") return true;
  if (p.startsWith("/stores/owner/")) {
    if (p === "/stores/owner/apply" || p.startsWith("/stores/owner/apply/")) return false;
    return true;
  }
  return false;
}

export function storesOwnerStackDepth(path: string | null | undefined): number {
  const p = normalizeOwnerStackPath(path);
  if (!isStoresOwnerStackPath(p)) return -1;
  if (p === "/stores/owner") return 0;
  const rest = p.slice("/stores/owner".length).replace(/^\//, "");
  if (!rest) return 0;
  return rest.split("/").filter(Boolean).length;
}

/** 스택 내부 이동 — `BusinessAdminShell` 내부 슬라이드만 사용, 메인 셸 슬라이드는 끔 */
export function shouldSuppressOwnerStackMainShellSlide(
  prevPath: string,
  nextPath: string
): boolean {
  return isStoresOwnerStackPath(prevPath) && isStoresOwnerStackPath(nextPath);
}
