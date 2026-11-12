"use client";

import { Activity, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
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

  return (
    <>
      {next.entries.map((entry) => {
        const visible = entry.id === currentRetained;
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
      {currentRetained ? null : <LiveRouteSlot key="live">{children}</LiveRouteSlot>}
    </>
  );
}

function sameRouterAddress(a: RouterCtx, b: RouterCtx): boolean {
  return a.pathname === b.pathname && (a.searchParams?.toString() ?? "") === (b.searchParams?.toString() ?? "");
}

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
