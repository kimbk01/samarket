"use client";

import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HubActiveContext } from "@/lib/layout/hub-active-context";
import { usePathname } from "next/navigation";
import { GlobalLayoutRouterContext, LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
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
  /** Next 전역 라우터 정보(트리·스크롤 신호) — 숨김·고정 칸은 이 값을 고정해 탭 이동마다 숨긴 허브의 Next 라우터가 다시 그려지지 않게 한다 */
  global: React.ContextType<typeof GlobalLayoutRouterContext>;
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
  const liveGlobal = useContext(GlobalLayoutRouterContext);
  /**
   * D1 S2: 보관 허브가 숨어 있거나 「같은 주소로 돌아온 직후」(떠나기 직전 정보로 그림)일 때는 Next 의 「새 화면을 보이게
   * 스크롤」 처리기(layout-router `handlePotentialScroll` → `scrollIntoView`)가 움직이지 않게 빈 스크롤 신호를 준다 —
   * 이 화면들의 스크롤 위치는 `AppScrollMemory` 가 맡는다. 예전 React Activity 에서는 숨긴 허브의 이 처리기가 깨어나지
   * 않았는데, CSS 숨김에서는 살아 있어 탭 복귀 때 복원(예: 900)을 0 으로 되돌렸다(2026-11-12 로컬 운영 빌드 확인).
   */
  const liveCtx = useMemo<RouterCtx | null>(
    () =>
      liveLayout
        ? {
            layout: liveLayout,
            pathname: livePathname,
            searchParams: liveSearchParams,
            params: liveParams,
            global: liveGlobal,
          }
        : null,
    [liveLayout, livePathname, liveSearchParams, liveParams, liveGlobal]
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
  /**
   * D1 S2: 칸마다 마지막으로 「현재 정보로」 그린 화면 요소. 숨김·고정 칸은 이 요소를 그대로 다시 쓴다 —
   * Next 는 이동마다 새 `children` 요소를 주므로, 그대로 넘기면 숨긴 허브 전체가 이동마다 다시 그려진다(Activity 때는
   * 그 일이 낮은 우선순위로 미뤄졌다). 같은 요소 객체면 React 가 그 아래를 건너뛴다.
   */
  const lastLiveElementRef = useRef(new Map<MainTabKeepAliveHubId, ReactNode>());

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
        const live = visible && entry.ctx === liveCtx;
        if (live) lastLiveElementRef.current.set(entry.id, children);
        const element = live ? children : (lastLiveElementRef.current.get(entry.id) ?? children);
        /** 보이는 칸: 같은 주소로 돌아온 직후면 떠나기 직전 정보(다시 만들지 않음), 그 밖에는 현재 정보 — `nextHubRetentionState` */
        return (
          /**
           * D1 S2: React `Activity` 대신 CSS 로 숨긴다 — 다시 보일 때 하위 효과 전체를 끊고 다시 연결하지 않는다.
           * 보일 때 `display: contents`(예전처럼 상자 없음 — 배치 동일), 숨길 때 `display: none`(광고 노출 관찰자가 보이지 않음으로 판정).
           * 숨김 중 멈춰야 하는 효과는 `HubActiveContext`(`useHubActive`)로 멈춘다.
           */
          <div
            key={`hub:${next.accountGeneration}:${entry.id}`}
            data-hub-retained={entry.id}
            style={visible ? HUB_VISIBLE_STYLE : HUB_HIDDEN_STYLE}
          >
            <HubActiveContext.Provider value={visible}>
              <GlobalLayoutRouterContext.Provider
                value={live ? liveGlobal : frozenInertGlobal(entry.ctx)}
              >
                <FrozenRouterContexts ctx={entry.ctx}>{element}</FrozenRouterContexts>
              </GlobalLayoutRouterContext.Provider>
            </HubActiveContext.Provider>
          </div>
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

type GlobalLayoutCtx = NonNullable<React.ContextType<typeof GlobalLayoutRouterContext>>;

/** Next 가 「적용할 스크롤 없음」으로 읽는 값 — Next 는 이 객체의 apply 를 false 로만 바꾼다 */
const INERT_FOCUS_AND_SCROLL_REF: GlobalLayoutCtx["focusAndScrollRef"] = {
  apply: false,
  hashFragment: null,
  segmentPaths: [],
  onlyHashChange: false,
};

/**
 * 숨김·고정 칸의 Next 전역 라우터 값 — 칸의 라우터 정보(`ctx`)마다 1개로 고정(같은 객체 → 탭 이동마다 다시 그리지 않음),
 * 스크롤 신호는 비활성(`AppScrollMemory` 가 위치 담당).
 */
const frozenGlobalByCtx = new WeakMap<object, GlobalLayoutCtx | null>();
function frozenInertGlobal(ctx: { global: GlobalLayoutCtx | null }): GlobalLayoutCtx | null {
  const hit = frozenGlobalByCtx.get(ctx);
  if (hit !== undefined) return hit;
  const v = ctx.global ? { ...ctx.global, focusAndScrollRef: INERT_FOCUS_AND_SCROLL_REF } : null;
  frozenGlobalByCtx.set(ctx, v);
  return v;
}

const HUB_VISIBLE_STYLE = { display: "contents" } as const;
const HUB_HIDDEN_STYLE = { display: "none" } as const;

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
