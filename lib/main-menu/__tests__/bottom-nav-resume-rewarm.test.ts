// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOTTOM_NAV_ITEMS, type BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import {
  collectBottomNavResumeRewarmHrefs,
  createBottomNavResumeRewarmTask,
} from "@/lib/main-menu/bottom-nav-resume-rewarm";
import { shouldPrefetchMainBottomNavHref } from "@/lib/main-menu/main-bottom-nav-link-prefetch-eligibility";
import {
  composeMainBottomNavDisplayTabs,
  resolveMainBottomNavSecondaryRailKind,
} from "@/lib/main-menu/main-bottom-nav-split-layout";
import { resolveMainBottomNavHubDomain } from "@/lib/main-menu/main-bottom-nav-domain";
import {
  resolveMainBottomNavTabEmphasisKind,
  resolveMainBottomNavTabTapHref,
} from "@/lib/main-menu/main-bottom-nav-tab-emphasis";
import { isMainBottomNavDisplayTabActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import { writeCommunityHubState } from "@/lib/community/community-hub-state";
import {
  createAppResumeCoordinator,
  type AppResumeCoordinatorDeps,
  type AppResumeSessionOutcome,
} from "@/lib/app-resume/app-resume-coordinator";
import { ROUTER_PREFETCH_REWARM_MIN_HIDDEN_MS } from "@/lib/performance/router-cache-policy";

const currentUser = vi.hoisted(() => ({ value: null as { id: string } | null }));
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: vi.fn(() => currentUser.value),
}));

type Search = { get: (key: string) => string | null } | null;

/**
 * `BottomNav` 가 렌더하는 Link 의 `prefetch={true}` 대상 집합 — `components/layout/BottomNav.tsx` 가 실제로 넘기는 인자 그대로:
 * - 탭 목록: `composeMainBottomNavDisplayTabs(pathname, tabs, searchParams, ownerNav.storeId)`
 * - 강조: `resolveMainBottomNavTabEmphasisKind(tab.id, pathname, { hubDomain: resolveMainBottomNavHubDomain(pathname) })`
 * - 일반 탭(`BottomNavTabStandard`): href `resolveMainBottomNavTabTapHref(tab.id, tab.href, { emphasisKind, pathname,
 *   searchParams, ownerStoreId })` · 활성 `isMainBottomNavDisplayTabActive(pathname, tab, { searchParams, secondaryRail })`
 * - 매장 탭(`BottomNavTabStores`): href `{ emphasisKind, pathname }` · 활성 `isMainBottomNavDisplayTabActive(pathname, tab)`
 * - 장바구니 탭(`BottomNavTabDeliveryCart`): `useCommerceCartNavHref(tab.href)` — 장바구니 경로는 프리페치 대상이 아니다(아래 검사).
 * - `prefetch={shouldPrefetchMainBottomNavHref(href, isActive)}`
 * 재준비 쪽 선택 함수를 쓰지 않고 Link 쪽 인자만으로 독립 계산한다.
 */
function linkPrefetchHrefs(
  pathname: string,
  tabs: readonly BottomNavItemConfig[],
  searchParams: Search,
  ownerStoreId: string | null
): Set<string> {
  const display = composeMainBottomNavDisplayTabs(pathname, tabs, searchParams, ownerStoreId);
  const hubDomain = resolveMainBottomNavHubDomain(pathname);
  const secondaryRail = resolveMainBottomNavSecondaryRailKind(pathname, searchParams);
  const usesDeliveryHubShell = display.some((t) => t.id === "delivery-cart");
  const out = new Set<string>();
  for (const tab of display) {
    const emphasisKind = resolveMainBottomNavTabEmphasisKind(tab.id, pathname, { hubDomain, pendingChatNav: false });
    let href: string;
    let isActive: boolean;
    if (tab.id === "delivery-cart") {
      expect(shouldPrefetchMainBottomNavHref(tab.href, false)).toBe(false);
      continue;
    } else if (tab.icon === "stores" && !usesDeliveryHubShell) {
      href = resolveMainBottomNavTabTapHref(tab.id, tab.href, { emphasisKind, pathname });
      isActive = isMainBottomNavDisplayTabActive(pathname, tab);
    } else {
      href = resolveMainBottomNavTabTapHref(tab.id, tab.href, { emphasisKind, pathname, searchParams, ownerStoreId });
      isActive = isMainBottomNavDisplayTabActive(pathname, tab, { searchParams, secondaryRail });
    }
    if (shouldPrefetchMainBottomNavHref(href, isActive)) out.add(href);
  }
  return out;
}

function pathOf(href: string): string {
  return (href.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
}
const isMemberOnly = (href: string) => {
  const p = pathOf(href);
  return p === "/mypage" || p === "/my" || p === "/community-messenger" || p.startsWith("/community-messenger/");
};

const PATHNAMES = [
  "/",
  "/home",
  "/philife",
  "/philife/post-1",
  "/community",
  "/market",
  "/market/cat",
  "/post/123",
  "/stores",
  "/stores/some-store",
  "/stores/search",
  "/stores/owner",
  "/stores/owner/s1/orders",
  "/orders/activity",
  "/mypage",
  "/my/settings",
  "/community-messenger",
  "/community-messenger/rooms/r1",
  "/community-messenger/trade-chats",
  "/write",
];
const SEARCHES: Search[] = [null, new URLSearchParams("section=chats"), new URLSearchParams("tab=trade")];
const OWNER_STORE_IDS = [null, "store-1"];

describe("bottom-nav resume rewarm — 대상 = 하단 탭 Link 프리페치와 같은 href 집합", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("회원: 경로·쿼리·사장님 매장 조합 전부에서 Link 프리페치 집합과 같다", () => {
    currentUser.value = { id: "u1" };
    for (const pathname of PATHNAMES) {
      for (const searchParams of SEARCHES) {
        for (const ownerStoreId of OWNER_STORE_IDS) {
          const expected = linkPrefetchHrefs(pathname, BOTTOM_NAV_ITEMS, searchParams, ownerStoreId);
          const actual = collectBottomNavResumeRewarmHrefs({
            pathname,
            tabs: BOTTOM_NAV_ITEMS,
            ctx: { searchParams, ownerStoreId },
          });
          expect(new Set(actual).size, `${pathname} 중복`).toBe(actual.length);
          expect(new Set(actual), `${pathname} ?${String(searchParams)} owner=${ownerStoreId}`).toEqual(expected);
          // 등록 작업(`BottomNavBootIdlePrewarmHost`)은 ctx 에 ownerStoreId 를 싣지 않는다 — 그래도 Link 집합과 같아야 한다.
          const asRegistered = collectBottomNavResumeRewarmHrefs({ pathname, tabs: BOTTOM_NAV_ITEMS, ctx: { searchParams } });
          expect(new Set(asRegistered), `${pathname} 등록 인자 owner=${ownerStoreId}`).toEqual(expected);
        }
      }
    }
  });

  it("커뮤니티 마지막 선택이 저장돼 있어 탭 href 가 바뀌어도 같은 집합", () => {
    currentUser.value = { id: "u1" };
    writeCommunityHubState({ kind: "local", topicSlug: "", allSort: "latest" });
    for (const pathname of PATHNAMES) {
      const expected = linkPrefetchHrefs(pathname, BOTTOM_NAV_ITEMS, null, null);
      const actual = collectBottomNavResumeRewarmHrefs({ pathname, tabs: BOTTOM_NAV_ITEMS, ctx: { searchParams: null } });
      expect(new Set(actual), pathname).toEqual(expected);
    }
  });

  it("비회원: Link 집합에서 회원 전용 탭(내정보·메신저)만 뺀 집합", () => {
    currentUser.value = null;
    for (const pathname of PATHNAMES) {
      const expected = new Set(
        [...linkPrefetchHrefs(pathname, BOTTOM_NAV_ITEMS, null, null)].filter((h) => !isMemberOnly(h))
      );
      const actual = collectBottomNavResumeRewarmHrefs({ pathname, tabs: BOTTOM_NAV_ITEMS, ctx: { searchParams: null } });
      expect(new Set(actual), pathname).toEqual(expected);
    }
  });
});

describe("bottom-nav resume rewarm — 실제 취소 경로(복귀 조정자에 등록되는 작업 그대로)", () => {
  function setup() {
    let now = 1_000;
    let releaseIdle: () => void = () => {};
    const idle = new Promise<void>((r) => {
      releaseIdle = r;
    });
    let releaseSession: (v: AppResumeSessionOutcome) => void = () => {};
    const sessionGate = new Promise<AppResumeSessionOutcome>((r) => {
      releaseSession = r;
    });
    const deps: AppResumeCoordinatorDeps = {
      now: () => now,
      resolveSession: () => sessionGate,
      waitForIdle: () => idle,
      isOnline: () => true,
      waitForOnline: async () => {},
      hasOwnLiveCall: () => false,
    };
    const c = createAppResumeCoordinator(deps, { visible: true });
    const prefetched: string[] = [];
    c.register(
      createBottomNavResumeRewarmTask(
        () => ({ pathname: "/stores", tabs: BOTTOM_NAV_ITEMS, ctx: { searchParams: null } }),
        (href) => prefetched.push(href)
      )
    );
    const resume = (hiddenMs = ROUTER_PREFETCH_REWARM_MIN_HIDDEN_MS) => {
      c.noteHidden("visibility_hidden");
      now += hiddenMs;
      c.noteVisible("visibility_visible");
    };
    return { c, prefetched, resume, releaseIdle, releaseSession: () => releaseSession("fresh") };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("정상 복귀: idle 뒤 Link 와 같은 대상을 한 번씩 요청", async () => {
    currentUser.value = { id: "u1" };
    const { prefetched, resume, releaseIdle, releaseSession } = setup();
    resume();
    releaseSession();
    await flush();
    expect(prefetched).toEqual([]); // idle 전에는 요청 없음
    releaseIdle();
    await flush();
    expect(prefetched.length).toBeGreaterThan(0);
    expect(new Set(prefetched).size).toBe(prefetched.length);
    expect(new Set(prefetched)).toEqual(linkPrefetchHrefs("/stores", BOTTOM_NAV_ITEMS, null, null));
  });

  it("idle 대기 중 다시 숨겨지면(조정자 abort) 아무 탭도 요청하지 않는다", async () => {
    currentUser.value = { id: "u1" };
    const { c, prefetched, resume, releaseIdle, releaseSession } = setup();
    resume();
    releaseSession();
    await flush();
    c.noteHidden("visibility_hidden");
    releaseIdle();
    await flush();
    expect(prefetched).toEqual([]);
  });

  it("세션 판정 중 로그아웃(abortCurrent)이면 아무 탭도 요청하지 않는다", async () => {
    currentUser.value = { id: "u1" };
    const { c, prefetched, resume, releaseIdle, releaseSession } = setup();
    resume();
    c.abortCurrent("signed_out");
    releaseSession();
    releaseIdle();
    await flush();
    expect(prefetched).toEqual([]);
  });

  it("숨김이 라우터 캐시 만료보다 짧으면 실행하지 않는다", async () => {
    currentUser.value = { id: "u1" };
    const { prefetched, resume, releaseIdle, releaseSession } = setup();
    resume(ROUTER_PREFETCH_REWARM_MIN_HIDDEN_MS - 1);
    releaseSession();
    releaseIdle();
    await flush();
    expect(prefetched).toEqual([]);
  });
});
