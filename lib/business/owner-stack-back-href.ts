/**
 * Owner stack back-parent SSOT — 4단계 IA-11 규칙 (2):
 * 뒤로가기 = `owner-nav-registry` 의 `parentId` (항목 하위 화면이면 그 항목) URL + `?storeId` 보존.
 * 부모 화면의 마지막 쿼리(필터·탭)는 sessionStorage 로 복원한다 (try/catch — 저장소 불가 시 무시).
 * 폼 이탈 가드(`owner-basic-info-guard.ts`)는 호출부에서 이 href 를 쓰기 **전에** 먼저 실행된다.
 */

import { OwnerRoutes } from "@/lib/business/owner-routes";
import {
  resolveOwnerNavBackTarget,
  resolveOwnerNavMatch,
  toOwnerNavRelativePath,
  type OwnerNavSearchInput,
} from "@/lib/business/owner-nav-registry";

const LAST_QUERY_KEY_PREFIX = "samarket:owner-nav-last-query:";

function searchToString(search: OwnerNavSearchInput): string {
  if (search == null) return "";
  if (typeof search === "string") return search.replace(/^\?/, "");
  if (search instanceof URLSearchParams) return search.toString();
  return "";
}

/**
 * Resolve back href for Owner chrome (non-hub). Returns undefined for hub.
 * 순수 함수 — 저장된 마지막 쿼리는 `applyOwnerNavParentLastQuery` 로 따로 합친다(SSR·hydration 안전).
 */
export function resolveOwnerStackBackHref(
  pathname: string,
  storeId: string,
  search?: OwnerNavSearchInput
): string | undefined {
  const sid = storeId.trim();
  if (!sid) return undefined;
  const rel = toOwnerNavRelativePath(pathname);
  if (rel === "") return undefined;
  const target = resolveOwnerNavBackTarget(pathname, search);
  if (!target || target.id === "my") return OwnerRoutes.hub(sid);
  return target.href(sid);
}

/** 오너 화면 방문 시 그 화면(항목 자신의 화면만)의 쿼리를 기억 — `storeId` 제외. */
export function rememberOwnerNavLastQuery(pathname: string, search: OwnerNavSearchInput): void {
  const match = resolveOwnerNavMatch(pathname, search);
  if (!match?.own) return;
  const rel = toOwnerNavRelativePath(pathname);
  if (rel == null || rel === "") return;
  const params = new URLSearchParams(searchToString(search));
  params.delete("storeId");
  try {
    const key = `${LAST_QUERY_KEY_PREFIX}${rel}`;
    const qs = params.toString();
    if (qs) window.sessionStorage.setItem(key, qs);
    else window.sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable — back keeps storeId only */
  }
}

/** 뒤로가기 href 에 부모 화면의 마지막 쿼리를 합친다 (`storeId` 는 href 값 유지). */
export function applyOwnerNavParentLastQuery(href: string): string {
  const [path = "", rawQ = ""] = href.split("?");
  const rel = toOwnerNavRelativePath(path);
  if (rel == null || rel === "") return href;
  let saved: string | null = null;
  try {
    saved = window.sessionStorage.getItem(`${LAST_QUERY_KEY_PREFIX}${rel}`);
  } catch {
    saved = null;
  }
  if (!saved) return href;
  const params = new URLSearchParams(rawQ);
  for (const [k, v] of new URLSearchParams(saved)) {
    if (k === "storeId") continue;
    params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
