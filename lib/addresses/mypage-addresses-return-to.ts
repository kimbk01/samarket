/** `/mypage/addresses/edit` — 주소 추가·수정 전용 페이지(하단 탭 숨김) */
export function isMypageAddressEditPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p === "/mypage/addresses/edit";
}

/** `/mypage/addresses/fine-tune` — 핀 미세조정 전체 화면(하단 탭 숨김) */
export function isMypageAddressFineTunePath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p === "/mypage/addresses/fine-tune";
}

/** `/mypage/addresses` — 주소 관리 목록(하단 탭 숨김) */
export function isMypageAddressListPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return p === "/mypage/addresses";
}

/** 주소 관리 플로우 전체 — 목록·추가/수정·미세조정 */
export function isMypageAddressFlowPath(pathname: string | null | undefined): boolean {
  return (
    isMypageAddressListPath(pathname) ||
    isMypageAddressEditPath(pathname) ||
    isMypageAddressFineTunePath(pathname)
  );
}

/**
 * 주소 스택 깊이 — 목록(0) → 추가/수정(1) → 미세조정(2).
 * 라우트 전환 우→좌 / 복귀 좌→우 360ms 에 사용.
 */
export function mypageAddressStackDepth(pathname: string | null | undefined): number {
  if (isMypageAddressFineTunePath(pathname)) return 2;
  if (isMypageAddressEditPath(pathname)) return 1;
  if (isMypageAddressListPath(pathname)) return 0;
  return -1;
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

export function buildMypageAddressFineTuneHref(opts: {
  returnTo?: string | null;
  id?: string | null;
}): string {
  const params = new URLSearchParams();
  const rt = parseSafeInternalReturnTo(opts.returnTo);
  if (rt) params.set("returnTo", rt);
  if (opts.id?.trim()) params.set("id", opts.id.trim());
  const q = params.toString();
  return q ? `/mypage/addresses/fine-tune?${q}` : "/mypage/addresses/fine-tune";
}

/**
 * MEMBER ADDRESS BOOK 진입 SSOT.
 * 모든 회원 주소 확인·선택·추가 진입은 이 href 만 사용한다.
 */
export function resolveMemberAddressBookHref(opts?: {
  pathname?: string | null;
  search?: string;
  returnTo?: string | null;
}): string {
  if (opts?.returnTo != null) {
    return buildMypageAddressesHref(opts.returnTo);
  }
  return buildMypageAddressesHrefFromPath(opts?.pathname, opts?.search ?? "");
}

type AddressBookRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

/** 페이지 스택(`/mypage/addresses` …)으로만 진입 — 모달·임베드 입력 금지 */
export function navigateToMemberAddressBook(
  router: AddressBookRouter,
  opts?: {
    pathname?: string | null;
    search?: string;
    returnTo?: string | null;
    replace?: boolean;
  },
): string {
  const href = resolveMemberAddressBookHref(opts);
  if (opts?.replace) router.replace(href);
  else router.push(href);
  return href;
}

export function navigateToMemberAddressEdit(
  router: AddressBookRouter,
  opts: {
    returnTo?: string | null;
    id?: string | null;
    map?: boolean;
    replace?: boolean;
  },
): string {
  const href = buildMypageAddressEditHref(opts);
  if (opts.replace) router.replace(href);
  else router.push(href);
  return href;
}
