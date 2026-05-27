/** `/mypage/addresses/edit` — 주소 추가·수정 전용 페이지(하단 탭 숨김) */
export function isMypageAddressEditPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p === "/mypage/addresses/edit";
}

/** `/mypage/addresses` — 주소 관리 목록(하단 탭 숨김) */
export function isMypageAddressListPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p === "/mypage/addresses";
}

/** 주소 관리 플로우 전체 — 목록·추가/수정 */
export function isMypageAddressFlowPath(pathname: string | null | undefined): boolean {
  return isMypageAddressListPath(pathname) || isMypageAddressEditPath(pathname);
}

export function parseStoreIdFromReturnTo(raw: string | null | undefined): string {
  const rt = parseSafeInternalReturnTo(raw);
  if (!rt) return "";
  const q = rt.indexOf("?");
  if (q < 0) return "";
  const params = new URLSearchParams(rt.slice(q + 1));
  return (params.get("storeId") ?? "").trim();
}

/** `/mypage/addresses` — `returnTo` 쿼리(내부 경로만) */
export function parseSafeInternalReturnTo(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "";
  return trimmed;
}

export function buildMypageAddressesHref(returnTo?: string | null): string {
  const rt = parseSafeInternalReturnTo(returnTo);
  if (!rt) return "/mypage/addresses";
  return `/mypage/addresses?returnTo=${encodeURIComponent(rt)}`;
}

/** 주소 관리 진입 직전 화면을 `returnTo`로 넘겨 확인·뒤로가기가 동일하게 동작하게 한다. */
export function resolveAddressFlowEntryPath(
  pathname: string | null | undefined,
  search = ""
): string {
  let base = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  let resolvedSearch = search;
  if (!base && typeof window !== "undefined") {
    base = window.location.pathname.split("?")[0]?.trim().replace(/\/+$/, "") || "";
    if (!resolvedSearch) resolvedSearch = window.location.search;
  }
  if (base === "/mypage/addresses" || base.startsWith("/mypage/addresses/")) {
    return "";
  }
  return parseSafeInternalReturnTo(`${base}${resolvedSearch}`);
}

export function buildMypageAddressesHrefFromPath(
  pathname: string | null | undefined,
  search = ""
): string {
  return buildMypageAddressesHref(resolveAddressFlowEntryPath(pathname, search));
}

export function buildMypageAddressEditHref(opts: {
  returnTo?: string | null;
  id?: string | null;
  map?: boolean;
}): string {
  const params = new URLSearchParams();
  const rt = parseSafeInternalReturnTo(opts.returnTo);
  if (rt) params.set("returnTo", rt);
  if (opts.id?.trim()) params.set("id", opts.id.trim());
  if (opts.map) params.set("map", "1");
  const q = params.toString();
  return q ? `/mypage/addresses/edit?${q}` : "/mypage/addresses/edit";
}
