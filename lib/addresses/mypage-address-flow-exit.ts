import { parseSafeInternalReturnTo } from "@/lib/addresses/mypage-addresses-return-to";

const SESSION_KEY = "samarket:address-mgmt-exit";

/** 주소 관리 플로우 — 확인·저장 후 복귀할 진입 직전 경로(내부 URL만) */
export function writeAddressFlowExitHref(raw: string | null | undefined): void {
  const href = parseSafeInternalReturnTo(raw);
  if (!href || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, href);
  } catch {
    /* quota / private mode */
  }
}

export function peekAddressFlowExitHref(): string {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return parseSafeInternalReturnTo(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return "";
  }
}

export function readAddressFlowExitHref(): string {
  const href = peekAddressFlowExitHref();
  clearAddressFlowExitHref();
  return href;
}

export function clearAddressFlowExitHref(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveAddressManagementExitHref(returnTo?: string | null): string {
  const fromQuery = parseSafeInternalReturnTo(returnTo);
  if (fromQuery) return fromQuery;
  return peekAddressFlowExitHref();
}
