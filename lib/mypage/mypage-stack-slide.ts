/**
 * 내정보(`/mypage/**` · `/my/**`) 하위 화면 push/back 스택 깊이 SSOT.
 * 형태는 `lib/trade/marketplace/marketplace-seller-hub-slide.ts` 와 같다.
 *
 * 설계: `docs/mypage-v2/dibay-mypage-v3-final-integrated-spec.md` Part A §1.3 (X2).
 * - 홈 `/mypage`·`/my` = 0
 * - 나머지 = 접두 제거 후 세그먼트 수. 단 `section/<group>/<item>` 은 1단계로 센다.
 *   예) `/mypage/section/settings/notifications` = 1, `/mypage/store-orders/abc` = 2,
 *       `/mypage/store-orders/abc/review` = 3, `/mypage/points/charge` = 2
 */

function normalize(path: string | null | undefined): string {
  const p = String(path ?? "").split("?")[0]?.trim() ?? "";
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/**
 * 거래 채팅(`/mypage/trade/chat`, S28 채팅 준비 포함)은 거래 채팅 도메인 전환 규칙 그대로 —
 * 내정보 300ms 슬라이드 규칙에서 제외(최종 설계 S28 「전환·복원」).
 */
export const MYPAGE_STACK_EXCLUDED_PREFIXES = ["/mypage/trade/chat"] as const;

function isExcludedFromMypageStack(p: string): boolean {
  return MYPAGE_STACK_EXCLUDED_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));
}

export function isMypageStackPath(path: string | null | undefined): boolean {
  const p = normalize(path);
  if (isExcludedFromMypageStack(p)) return false;
  return p === "/mypage" || p.startsWith("/mypage/") || p === "/my" || p.startsWith("/my/");
}

/** -1 = 내정보 스택 밖 */
export function mypageStackDepth(path: string | null | undefined): number {
  const p = normalize(path);
  if (!isMypageStackPath(p)) return -1;
  const rest = p.startsWith("/mypage") ? p.slice("/mypage".length) : p.slice("/my".length);
  const segs = rest.split("/").filter(Boolean);
  if (segs.length === 0) return 0;
  if (segs[0] === "section") {
    /** `section` · `section/<group>` · `section/<group>/<item>` = 1, 그 아래는 1단계씩 */
    return 1 + Math.max(0, segs.length - 3);
  }
  return segs.length;
}

/**
 * 다른 도메인 슬라이드 규칙(판매자 허브 440ms · 커머스 스택)이 먼저 잡던 내정보 경로 (설계서 §4 ②).
 * 내정보 ↔ 내정보 이동이면 내정보 300ms 스택 규칙을 쓴다.
 */
export function isMypageStackPromotedPath(path: string | null | undefined): boolean {
  const p = normalize(path);
  if (p === "/mypage/products" || p.startsWith("/mypage/products/")) return true;
  if (p === "/mypage/points/promotions" || p.startsWith("/mypage/points/promotions/")) return true;
  return /^\/mypage\/gift-certificates\/[^/]+$/.test(p);
}

/** 커머스 지갑 허브 별칭 — 상품권 허브 ↔ 상세 왕복은 커머스 지갑 스택(배달 도메인 헤더) 그대로 */
function isCommerceWalletHubAlias(p: string): boolean {
  return p === "/mypage/coupons" || p === "/mypage/gift-certificates";
}

/**
 * 내정보 ↔ 내정보 쌍인데 한쪽이 `isMypageStackPromotedPath` 이면 true → 내정보 300ms 스택 kind.
 * `/market/sell` ↔ `/mypage/products` 처럼 한쪽이 내정보 밖이면 false(판매자 허브 규칙 유지).
 */
export function shouldUseMypageStackForPromotedPair(
  prevPath: string | null | undefined,
  nextPath: string | null | undefined
): boolean {
  const a = normalize(prevPath);
  const b = normalize(nextPath);
  if (!isMypageStackPath(a) || !isMypageStackPath(b)) return false;
  if (!isMypageStackPromotedPath(a) && !isMypageStackPromotedPath(b)) return false;
  if (isCommerceWalletHubAlias(a) || isCommerceWalletHubAlias(b)) return false;
  return true;
}
