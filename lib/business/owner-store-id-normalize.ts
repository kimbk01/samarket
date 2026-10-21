/**
 * IA-08 — 오너 셸 매장 컨텍스트 단일 해석.
 *
 * 셸(`BusinessAdminShell`)이 `resolveOwnerActiveStoreRow` 로 고른 `selectedRow` 가 유일한 권한이다.
 * URL 에 `storeId` 가 없으면 셸 한 곳에서 이 함수 결과로 `router.replace` 해 모든 화면이
 * 같은 `?storeId=` 를 읽게 한다(화면별 `stores[0]`·자체 resolver 금지).
 */

const OWNER_STACK_BASE = "/stores/owner";

/** 셸이 마운트되는 오너 스택 경로인지 (apply·order-chat ensure 는 셸 밖). */
export function isOwnerStoreIdNormalizablePath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p !== OWNER_STACK_BASE && !p.startsWith(`${OWNER_STACK_BASE}/`)) return false;
  if (p.startsWith(`${OWNER_STACK_BASE}/apply`)) return false;
  if (p === `${OWNER_STACK_BASE}/order-chat` || p.startsWith(`${OWNER_STACK_BASE}/order-chat/`)) {
    return false;
  }
  return true;
}

/**
 * URL 에 `storeId` 가 없고 셸이 매장을 골랐으면 `?storeId=<selected>` 를 맨 앞에 붙인 href.
 * 이미 storeId 가 있거나(유효성 판단은 셸 resolver 몫) 선택 매장이 없으면 `null` (이동 없음).
 */
export function buildOwnerStoreIdNormalizedHref(input: {
  pathname: string;
  search: string;
  hash?: string | null;
  selectedStoreId: string | null | undefined;
}): string | null {
  const sid = (input.selectedStoreId ?? "").trim();
  if (!sid) return null;
  if (!isOwnerStoreIdNormalizablePath(input.pathname)) return null;
  const raw = input.search.startsWith("?") ? input.search.slice(1) : input.search;
  const current = new URLSearchParams(raw);
  if ((current.get("storeId") ?? "").trim()) return null;
  const next = new URLSearchParams();
  next.set("storeId", sid);
  current.forEach((value, key) => {
    if (key !== "storeId") next.append(key, value);
  });
  const hash = (input.hash ?? "").trim();
  return `${input.pathname}?${next.toString()}${hash && hash !== "#" ? (hash.startsWith("#") ? hash : `#${hash}`) : ""}`;
}
