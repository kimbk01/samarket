/**
 * 메인 하단 탭 **현재 순서** 기준의 canonical 인덱스 빌더.
 *
 * 역할:
 * - admin(`/admin/menus/main-bottom-nav`)에서 변경한 5탭(+ `custom_*`) 순서를 단일 소스로
 *   `useRouteTransitionKindRef` 에 주입해, 본문 슬라이드 방향이 **DB 저장 순서대로** 결정되게 한다.
 * - 정적 fallback(`route-transition-config.ts` 의 `resolveCanonicalNavIndex`) 과 시그니처가 호환된다.
 *
 * 매칭 우선순위:
 *   1) `BUILTIN_TAB_PATH_ALIASES[tab.id]` 별칭 prefix 매칭 (거래의 `/post`, `/products` 등)
 *   2) `tab.href` pathname 부분으로 prefix 매칭
 *   3) 여러 탭에 매칭되면 **가장 긴 prefix** 우선
 *
 * 실패 케이스:
 * - 제외 경로(`isExcludedFromMainShellTransition` — `/admin`, `/auth`, `/account`)는 항상 `null`.
 * - 매칭 0개면 `null` → `kind = "none"` 으로 슬라이드 생략.
 */

import {
  BOTTOM_NAV_BUILTIN_IDS,
  type BottomNavBuiltinTabId,
  type BottomNavItemConfig,
  type BottomNavTabId,
} from "@/lib/main-menu/bottom-nav-config";
import {
  isExcludedFromMainShellTransition,
  normalizePathForRouteTransition,
} from "@/components/route-transition/route-transition-config";

const BUILTIN_ID_SET = new Set<string>(BOTTOM_NAV_BUILTIN_IDS);

function isBuiltinId(id: BottomNavTabId): id is BottomNavBuiltinTabId {
  return BUILTIN_ID_SET.has(id);
}

/**
 * 빌트인 탭별 sub-route 별칭 — 사용자 라우트가 `tab.href` 와 다르더라도 같은 탭으로 묶기 위함.
 * 여기 담긴 prefix 가 활성·슬라이드 인덱스 매칭의 1순위로 쓰인다.
 *
 * 신규 sub-route 가 생기면 이 표만 갱신한다 (정적 `resolveCanonicalNavIndex` 와 동기 유지).
 */
export const BUILTIN_TAB_PATH_ALIASES: Record<BottomNavBuiltinTabId, readonly string[]> = {
  /** `/` Cold Boot home = Community surface (same as `/philife`) */
  community: ["/", "/philife", "/community"],
  home: ["/market", "/post", "/products", "/write", "/shop"],
  stores: ["/stores", "/orders"],
  chat: ["/community-messenger", "/chats", "/chat"],
  my: ["/mypage", "/my"],
};

/** `/community-messenger` 가 `/community` 접두와 충돌하지 않게 — 더 긴 prefix 우선 */
function pathHasPrefix(path: string, prefix: string): boolean {
  if (!prefix) return false;
  if (path === prefix) return true;
  return path.startsWith(`${prefix}/`);
}

function tabHrefPath(tab: BottomNavItemConfig): string {
  return (tab.href.split("?")[0] ?? "").trim();
}

/**
 * 한 탭이 path 에 매칭되면 매칭된 prefix 길이를 반환(없으면 0).
 *
 * - 빌트인: 별칭 + tab.href 모두 후보. 가장 긴 prefix 길이 반환.
 * - custom_*: `tab.href` pathname 부분만 후보.
 */
function matchTabPrefixLength(path: string, tab: BottomNavItemConfig): number {
  let best = 0;
  if (isBuiltinId(tab.id)) {
    const aliases = BUILTIN_TAB_PATH_ALIASES[tab.id];
    for (const a of aliases) {
      if (pathHasPrefix(path, a) && a.length > best) best = a.length;
    }
  }
  const hrefPath = tabHrefPath(tab);
  if (hrefPath && pathHasPrefix(path, hrefPath) && hrefPath.length > best) {
    best = hrefPath.length;
  }
  return best;
}

export type CanonicalNavIndexResolver = (pathname: string | null) => number | null;

/**
 * `tabs` 의 **현재 순서** 기준으로 canonical 인덱스 resolver 를 만든다.
 *
 * - `tabs.length === 0` 이면 항상 `null` 반환(셸 미부트 또는 fetch 실패).
 * - 매칭이 두 탭에 동시에 걸리면 가장 긴 prefix 가 이긴다.
 *   (예: tabs 에 `chat`(`/community-messenger`) 와 `community`(`/philife,/community`) 가 같이 있을 때
 *    `/community-messenger/...` → `chat` 매칭, `/community/...` → `community` 매칭)
 */
export function buildCanonicalNavIndexResolver(
  tabs: readonly BottomNavItemConfig[]
): CanonicalNavIndexResolver {
  const cached = tabs.slice();
  return (pathname) => {
    const p = normalizePathForRouteTransition(pathname);
    if (!p || isExcludedFromMainShellTransition(pathname)) return null;
    if (cached.length === 0) return null;

    let bestIndex = -1;
    let bestLen = 0;
    for (let i = 0; i < cached.length; i++) {
      const len = matchTabPrefixLength(p, cached[i]!);
      if (len > bestLen) {
        bestLen = len;
        bestIndex = i;
      }
    }
    return bestIndex >= 0 ? bestIndex : null;
  };
}
