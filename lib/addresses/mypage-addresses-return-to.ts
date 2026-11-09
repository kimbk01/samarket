/** `/mypage/addresses/edit` — 주소 추가·수정 전용 페이지(하단 탭 숨김) */
export function isMypageAddressEditPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p === "/mypage/addresses/edit";
}

/** `/mypage/addresses/map` — 지도 위치 확인 단계 */
export function isMypageAddressMapPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p === "/mypage/addresses/map";
}

/** `/mypage/addresses/search` — 주소 검색 전용 페이지 */
export function isMypageAddressSearchPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p === "/mypage/addresses/search";
}

/** `/mypage/addresses` — 주소 관리 목록(하단 탭 숨김) */
export function isMypageAddressListPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p === "/mypage/addresses";
}

/** 주소 관리 플로우 전체 — 목록·검색·추가/수정 */
export function isMypageAddressFlowPath(pathname: string | null | undefined): boolean {
  return (
    isMypageAddressListPath(pathname) ||
    isMypageAddressEditPath(pathname) ||
    isMypageAddressSearchPath(pathname) ||
    isMypageAddressMapPath(pathname)
  );
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

/**
 * 주소 입력 흐름의 목적 (Owner 2026-11-09 「시안대로 구현」) — 배달 화면에서 들어오면 `delivery`, 그 밖은 일반.
 * 배달: 제목 「배달 받을 주소…」·저장 주소 선택·세부 주소 필수·찾아오는 길·요청사항.
 * 일반: 「주소를 검색해 주세요」·세부 주소 선택·배달 칸 없음.
 * 흐름(목록 → 검색 → 지도 → 저장) 사이에서는 `purpose` 쿼리로만 전달한다.
 */
export type AddressFlowPurpose = "general" | "delivery";

export const ADDRESS_FLOW_PURPOSE_QUERY = "purpose";

export function parseAddressFlowPurpose(raw: string | null | undefined): AddressFlowPurpose {
  return String(raw ?? "").trim() === "delivery" ? "delivery" : "general";
}

function withPurpose(params: URLSearchParams, purpose?: AddressFlowPurpose | null): void {
  if (purpose === "delivery") params.set(ADDRESS_FLOW_PURPOSE_QUERY, "delivery");
}

export function buildMypageAddressesHref(
  returnTo?: string | null,
  opts?: { purpose?: AddressFlowPurpose | null },
): string {
  const rt = parseSafeInternalReturnTo(returnTo);
  const params = new URLSearchParams();
  if (rt) params.set("returnTo", rt);
  withPurpose(params, opts?.purpose);
  const q = params.toString();
  return q ? `/mypage/addresses?${q}` : "/mypage/addresses";
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
  search = "",
  opts?: { purpose?: AddressFlowPurpose | null },
): string {
  return buildMypageAddressesHref(resolveAddressFlowEntryPath(pathname, search), opts);
}

/** 배달 화면 진입 — 주소 흐름을 배달 주소로 연다 */
export function buildDeliveryAddressesHrefFromPath(pathname: string | null | undefined, search = ""): string {
  return buildMypageAddressesHrefFromPath(pathname, search, { purpose: "delivery" });
}

export function buildMypageAddressEditHref(opts: {
  returnTo?: string | null;
  id?: string | null;
  map?: boolean;
  purpose?: AddressFlowPurpose | null;
}): string {
  const params = new URLSearchParams();
  const rt = parseSafeInternalReturnTo(opts.returnTo);
  if (rt) params.set("returnTo", rt);
  if (opts.id?.trim()) params.set("id", opts.id.trim());
  if (opts.map) params.set("map", "1");
  withPurpose(params, opts.purpose);
  const q = params.toString();
  return q ? `/mypage/addresses/edit?${q}` : "/mypage/addresses/edit";
}

/** 지도 위치 확인 단계 — 검색·현재 위치로 고른 주소의 핀을 맞춘 뒤 저장 화면으로 */
export function buildMypageAddressMapHref(opts: {
  returnTo?: string | null;
  id?: string | null;
  purpose?: AddressFlowPurpose | null;
}): string {
  const params = new URLSearchParams();
  const rt = parseSafeInternalReturnTo(opts.returnTo);
  if (rt) params.set("returnTo", rt);
  if (opts.id?.trim()) params.set("id", opts.id.trim());
  withPurpose(params, opts.purpose);
  const q = params.toString();
  return q ? `/mypage/addresses/map?${q}` : "/mypage/addresses/map";
}

export function buildMypageAddressSearchHref(opts?: {
  returnTo?: string | null;
  id?: string | null;
  purpose?: AddressFlowPurpose | null;
}): string {
  const rt = parseSafeInternalReturnTo(opts?.returnTo);
  const id = opts?.id?.trim() ?? "";
  const params = new URLSearchParams();
  if (rt) params.set("returnTo", rt);
  /** 편집 중 좌표 없는 주소 재검색 — 검색 결과를 같은 주소 편집으로 되돌린다 (UX-002) */
  if (id) params.set("id", id);
  withPurpose(params, opts?.purpose);
  const q = params.toString();
  return q ? `/mypage/addresses/search?${q}` : "/mypage/addresses/search";
}
