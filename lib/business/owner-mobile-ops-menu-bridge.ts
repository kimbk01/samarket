/**
 * 매장 오너 우측 햄버거(운영 메뉴) — BodyPortal 헤더·Context 타이밍과 무관하게 열기.
 * `BusinessAdminShell` 이 등록, `OwnerMobileAdminHeader` 등이 호출.
 */
let openHandler: (() => void) | null = null;

export function registerOwnerMobileOpsMenuOpen(handler: (() => void) | null): void {
  openHandler = handler;
}

export function openOwnerMobileOpsMenu(): boolean {
  if (!openHandler) return false;
  openHandler();
  return true;
}
