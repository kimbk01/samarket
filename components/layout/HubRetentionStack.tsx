"use client";

import { Activity, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  NavigationPromisesContext,
  PathnameContext,
  PathParamsContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import {
  resolveMainTabKeepAliveHub,
  type MainTabKeepAliveHubId,
} from "@/lib/layout/resolve-main-surface";
import { peekHubDataEpoch } from "@/lib/http/hub-data-epoch";
import { useBottomNavShowingTarget } from "@/lib/main-menu/use-bottom-nav-controller";
import { BottomNavHubSkeleton } from "@/components/layout/BottomNavHubSkeleton";
import {
  appScrollKey,
  readAppScroll,
  restoreAppScroll,
  scrollAppToTop,
} from "@/lib/navigation/app-scroll-memory";
import {
  allocateHubRetentionInstanceId,
  forgetHubRetentionInstance,
  HUB_RETENTION_HUB_IDS,
  nextHubRetentionState,
  recordHubRetentionSnapshot,
  resolveHubRetentionViewerKey,
  type HubRetentionState,
} from "@/lib/layout/hub-retention-state";

/**
 * 숨긴 허브에 다시 공급하는 라우터 정보 묶음 — 레이아웃 라우터 + 주소·검색어·경로 값.
 * 주소 값까지 고정해야 숨긴 허브가 「지금 주소」(다른 탭)를 보고 화면을 비우거나(예: 내정보 비회원 막기) 다시 그리지 않는다.
 */
type RouterCtx = {
  layout: NonNullable<React.ContextType<typeof LayoutRouterContext>>;
  pathname: React.ContextType<typeof PathnameContext>;
  searchParams: React.ContextType<typeof SearchParamsContext>;
  params: React.ContextType<typeof PathParamsContext>;
};

/**
 * D1 (Owner 「D1 상세 설계」 2026-11-11, `docs/audit/d1-hub-screen-retention-design-2026-11-11.md` §3)
 * 하단 탭 허브 화면 보관대 — 한 번 연 허브 화면을 `Activity hidden` 으로 보관해 재진입 때 다시 그리지 않는다.
 *
 * - Next 가 넘기는 `children` 은 「현재 경로」를 그리는 라우터 요소다(경로 정보는 `LayoutRouterContext` 에서 읽음).
 *   그래서 숨긴 허브는 「그 허브를 떠나기 직전의 라우터 정보」를 같은 `children` 에 다시 공급해 그 화면을 유지한다.
 * - 보이는 허브는 현재 라우터 정보 그대로 → 지금과 같은 화면. 허브가 아닌 경로는 마지막 칸에서 `children` 그대로.
 * - 포털·DOM 이동 없음: 보관대는 화면 이동 연출이 보는 덩어리(`mainInnerColumn`) 안에 그대로 있다.
 *   두 화면 연출(D 방식)의 「나가는 화면 사본」은 새로 마운트되는 사본이라 보관 목록이 비어 있어 보이는 화면 1개만 그린다.
 * - 계정이 바뀌면(회원 A→B·로그아웃) 보관 목록을 비운다 — 다른 계정 화면 노출 금지.
 * - 채팅 허브는 숨김 중 실시간·읽음 계약 시험 전까지 보관하지 않는다(설계서 §3-7).
 */
export function HubRetentionStack({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const liveLayout = useContext(LayoutRouterContext);
  const livePathname = useContext(PathnameContext);
  const liveSearchParams = useContext(SearchParamsContext);
  const liveParams = useContext(PathParamsContext);
  const liveCtx = useMemo<RouterCtx | null>(
    () =>
      liveLayout
        ? { layout: liveLayout, pathname: livePathname, searchParams: liveSearchParams, params: liveParams }
        : null,
    [liveLayout, livePathname, liveSearchParams, liveParams]
  );
  const membership = useClientMembershipState("hub-retention-stack");
  const viewerKey = resolveHubRetentionViewerKey(membership);
  const hubId = resolveMainTabKeepAliveHub(pathname);

  const [state, setState] = useState<HubRetentionState<RouterCtx>>(() => ({
    viewerKey,
    currentId: null,
    accountGeneration: 0,
    entries: [],
  }));
  const [instanceId] = useState(allocateHubRetentionInstanceId);

  /** 숨긴 허브 기록 — 하단 탭 미리 받기가 보관 중 허브의 데이터를 다시 받지 않게 (60초 규칙과 같은 기준) */
  const hiddenIdsKey = state.entries
    .map((e) => e.id)
    .filter((id) => id !== hubId)
    .join(",");
  useEffect(() => {
    const hidden = hiddenIdsKey ? (hiddenIdsKey.split(",") as MainTabKeepAliveHubId[]) : [];
    recordHubRetentionSnapshot(instanceId, hidden, peekHubDataEpoch());
  }, [instanceId, hiddenIdsKey]);
  useEffect(() => () => forgetHubRetentionInstance(instanceId), [instanceId]);

  /**
   * 하단 탭 즉시 교체 (계약 v2 · Owner 2026-11-15 · 설계서 §5-2): 손 뗀 프레임부터 Next 경로 확정 전까지
   * 목표 허브가 보관돼 있으면 그 칸을 바로 보이고, 없으면(처음 여는 허브·채팅) 그 허브 뼈대를 보인다.
   * 이전 화면(보관 칸·지금 경로 화면)은 숨긴다. 경로가 확정되면 아래 규칙(현재 경로 기준)으로 그대로 이어진다.
   */
  const showingTarget = useBottomNavShowingTarget();
  const showingHub = showingTarget ? resolveMainTabKeepAliveHub(showingTarget.path) : null;

  /**
   * 즉시 교체 때 스크롤 — 보관 화면은 그 탭 마지막 위치(P2), 뼈대는 맨 위. 경로 확정 뒤 `AppScrollMemory` 가 같은 규칙으로
   * 다시 확인한다(같은 값이라 움직이지 않음). 이동 중에는 `AppScrollMemory` 가 저장하지 않는다(이전 화면 키 오염 방지).
   */
  const scrollShowingId = showingTarget && showingHub != null && showingHub !== hubId ? showingTarget.id : null;
  const scrollShowingRetained =
    showingHub != null && HUB_RETENTION_HUB_IDS.has(showingHub) && state.entries.some((e) => e.id === showingHub);
  useLayoutEffect(() => {
    if (scrollShowingId == null || !showingTarget) return;
    if (!scrollShowingRetained) {
      scrollAppToTop();
      return;
    }
    const snap = readAppScroll(appScrollKey(showingTarget.path, showingTarget.search));
    if (!snap || snap.y <= 0) {
      scrollAppToTop();
      return;
    }
    return restoreAppScroll(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 이동 1회(id)마다 한 번
  }, [scrollShowingId]);

  if (!liveCtx) return <>{children}</>;

  const next = nextHubRetentionState(state, {
    hubId,
    viewerKey,
    liveCtx,
    retainable: HUB_RETENTION_HUB_IDS,
    sameAddress: sameRouterAddress,
  });
  if (next !== state) setState(next);

  const currentRetained: MainTabKeepAliveHubId | null =
    hubId && HUB_RETENTION_HUB_IDS.has(hubId) ? hubId : null;

  const showingActive = showingHub != null && showingHub !== hubId;
  const showingRetained =
    showingActive && HUB_RETENTION_HUB_IDS.has(showingHub) && next.entries.some((e) => e.id === showingHub);
  const visibleRetained: MainTabKeepAliveHubId | null = showingActive
    ? showingRetained
      ? showingHub
      : null
    : currentRetained;

  return (
    <>
      {next.entries.map((entry) => {
        const visible = entry.id === visibleRetained;
        /** 보이는 칸: 같은 주소로 돌아온 직후면 떠나기 직전 정보(다시 만들지 않음), 그 밖에는 현재 정보 — `nextHubRetentionState` */
        return (
          <Activity key={`hub:${next.accountGeneration}:${entry.id}`} mode={visible ? "visible" : "hidden"}>
            <FrozenRouterContexts ctx={entry.ctx}>{children}</FrozenRouterContexts>
          </Activity>
        );
      })}
      {/**
       * 허브가 아닌 화면(글·매장·대화방 등)은 계정 세대를 key 에 넣지 않는다 — 그 화면에서 로그인·로그아웃해도
       * 주소가 그대로면 화면(스크롤·작성 중 내용)을 유지한다(D1 이전과 같음). 계정 세대는 보관 허브 칸에만 쓴다.
       */}
      {currentRetained ? null : (
        <Activity key="live" mode={showingActive ? "hidden" : "visible"}>
          <LiveRouteSlot>{children}</LiveRouteSlot>
        </Activity>
      )}
      {showingActive && !showingRetained && showingHub ? <BottomNavHubSkeleton hub={showingHub} /> : null}
    </>
  );
}

function sameRouterAddress(a: RouterCtx, b: RouterCtx): boolean {
  return a.pathname === b.pathname && (a.searchParams?.toString() ?? "") === (b.searchParams?.toString() ?? "");
}

/**
 * Next 16.1.7 개발 모드의 `usePathname`·`useSearchParams` 는 `NavigationPromisesContext`(Suspense 계측)를 먼저 읽어
 * 고정한 주소를 무시한다(운영 빌드는 읽지 않음). 보관 칸에서는 null 로 공급해 개발에서도 운영과 같은 고정 주소를 읽게 한다 —
 * 개발 서버에서 숨긴 내정보 비회원 문지기가 다른 탭 주소를 보고 `/mypage?next=` 로 되돌리던 현상(2026-11-15 확인).
 */
function FrozenRouterContexts({ ctx, children }: { ctx: RouterCtx; children: ReactNode }) {
  return (
    <LayoutRouterContext.Provider value={ctx.layout}>
      <PathnameContext.Provider value={ctx.pathname}>
        <SearchParamsContext.Provider value={ctx.searchParams}>
          <PathParamsContext.Provider value={ctx.params}>{children}</PathParamsContext.Provider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </LayoutRouterContext.Provider>
  );
}

function LiveRouteSlot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
