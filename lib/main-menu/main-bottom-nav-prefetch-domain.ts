/**
 * 거래 셸의 `/market` 접두는 `main-bottom-nav-prefetch-pick` 의 `isBottomNavTabActive` 와 동일하게 둔다.
 *
 * 하단 탭 idle `router.prefetch` 의 effect 의존성을 **풀 pathname** 에 두면,
 * 같은 탭 도메인 안에서만 이동할 때(예: `/philife/a` → `/philife/b`)에도
 * 나머지 탭 RSC 를 반복 긁어 네트워크·메인 스레드가 현재 화면과 경쟁한다.
 * 키는 하단 탭이 의미하는 **셸 도메인** 단위로만 바뀌게 한다.
 */
export type MainBottomNavPrefetchDomain =
  | "trade"
  | "philife"
  | "stores"
  | "messenger"
  | "my"
  | "root"
  | "other";

export function mainBottomNavPrefetchTriggerKey(pathname: string | null): MainBottomNavPrefetchDomain {
  const raw = (pathname ?? "").split("?")[0]?.trim() ?? "";
  const p = raw.replace(/\/+$/, "") || "/";
  if (p === "/" || !p) return "root";
  if (p === "/home" || p === "/market" || p.startsWith("/market/")) return "trade";
  if (p === "/philife" || p.startsWith("/philife/")) return "philife";
  if (p === "/stores" || p.startsWith("/stores/")) return "stores";
  if (p === "/community-messenger" || p.startsWith("/community-messenger/")) return "messenger";
  /** 하단 「내정보」는 `/mypage` 링크이나 앱 내 `/my/*` 가 동일 셸로 오래 머무는 경우가 많다 */
  if (p === "/mypage" || p.startsWith("/mypage/") || p === "/my" || p.startsWith("/my/")) return "my";
  return "other";
}
