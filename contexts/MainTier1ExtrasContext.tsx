"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";

/** `RegionBar` 1단에 합쳐지는 페이지별 오버라이드(제목·우측 등) */
export type MainTier1Partial = {
  title?: ReactNode;
  titleText?: string;
  subtitle?: string;
  subtitleHref?: string;
  backHref?: string;
  preferHistoryBack?: boolean;
  ariaLabel?: string;
  showHubQuickActions?: boolean;
  rightSlot?: ReactNode;
  /** true면 뒤로 칸은 비움(주문 허브 등) */
  hideBack?: boolean;
  /** true면 1단 헤더 하단 `border-b` 제거(커뮤니티 메신저 허브 등) */
  hideTier1BottomBorder?: boolean;
  /** true면 1단 제목을 뒤로가기 쪽(좌)으로 정렬 — 기본은 가운데 */
  alignTier1TitleStart?: boolean;
  /** 있으면 좌측 뒤로 버튼 대체(글쓰기 취소 확인 등) */
  leftSlot?: ReactNode;
};

export type MainTier1ExtrasState = {
  tier1?: MainTier1Partial;
  /** `MyManagedCtaStrip`용 */
  ctaLinks?: { href: string; label: string }[];
  stickyBelow?: ReactNode;
  /**
   * 등록한 화면의 pathname. 있으면 현재 pathname 과 같을 때만 헤더에 반영한다
   * (전환 중 이전 화면 제목·아이콘 잔존 차단 — 설계서 §12 「전환 중」·§13-4).
   * 생략 시(레거시 등록) 경로 무관하게 반영.
   */
  pathname?: string;
};

/**
 * 현재 pathname 기준으로 유효한 extras 만 돌려준다.
 * 다른 경로에서 등록된 extras(이전 화면 잔존)는 `null`.
 */
export function mainTier1ExtrasForPathname(
  extras: MainTier1ExtrasState | null | undefined,
  pathname: string | null | undefined
): MainTier1ExtrasState | null {
  if (!extras) return null;
  if (extras.pathname == null) return extras;
  return normalizeAppPathnameForTier1(extras.pathname) === normalizeAppPathnameForTier1(pathname)
    ? extras
    : null;
}

function sameMainTier1Partial(a: MainTier1Partial | undefined, b: MainTier1Partial | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.title === b.title &&
    a.titleText === b.titleText &&
    a.subtitle === b.subtitle &&
    a.subtitleHref === b.subtitleHref &&
    a.backHref === b.backHref &&
    a.preferHistoryBack === b.preferHistoryBack &&
    a.ariaLabel === b.ariaLabel &&
    a.showHubQuickActions === b.showHubQuickActions &&
    a.hideBack === b.hideBack &&
    a.hideTier1BottomBorder === b.hideTier1BottomBorder &&
    a.alignTier1TitleStart === b.alignTier1TitleStart &&
    a.rightSlot === b.rightSlot &&
    a.leftSlot === b.leftSlot
  );
}

/** Provider·shell effect — 동일 extras 재등록 방지 */
export function sameMainTier1ExtrasState(a: MainTier1ExtrasState, b: MainTier1ExtrasState): boolean {
  return (
    sameMainTier1Partial(a.tier1, b.tier1) &&
    a.ctaLinks === b.ctaLinks &&
    a.stickyBelow === b.stickyBelow &&
    a.pathname === b.pathname
  );
}

type MainTier1ExtrasContextValue = {
  extras: MainTier1ExtrasState | null;
  /**
   * `next = null` 에 `onlyIfCurrent` 를 주면 지금 값이 그 등록과 같을 때만 지운다 (S4 — 두 칸에서 목록 허브가
   * 숨겨질 때 상세가 등록한 값을 지우지 않게). 생략하면 지금처럼 무조건 지운다.
   */
  setMainTier1Extras: (next: MainTier1ExtrasState | null, onlyIfCurrent?: MainTier1ExtrasState) => void;
};

const MainTier1ExtrasStateContext = createContext<MainTier1ExtrasState | null>(null);
/**
 * S4 두 칸 — 경로를 밝혀 등록한 extras 의 경로별 값(지금 등록돼 있는 것만 — 해제 때 지운다).
 * 두 칸에서는 목록 칸·상세 칸 머리글이 동시에 보이므로 「마지막 등록 1개」만으로는 둘을 그릴 수 없다.
 * 머리글 부품은 `useHeaderScopedMainTier1Extras` 로 읽는다(마지막 등록이 이 경로 것이면 그대로 — 지금과 같음).
 */
const MainTier1ExtrasByPathContext = createContext<ReadonlyMap<string, MainTier1ExtrasState> | null>(null);
const MainTier1ExtrasSetterContext = createContext<
  MainTier1ExtrasContextValue["setMainTier1Extras"] | null
>(null);

function sameOrEqual(a: MainTier1ExtrasState | null | undefined, b: MainTier1ExtrasState | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return sameMainTier1ExtrasState(a, b);
}

export function MainTier1ExtrasProvider({ children }: { children: ReactNode }) {
  const [extras, setExtras] = useState<MainTier1ExtrasState | null>(null);
  const [byPath, setByPath] = useState<ReadonlyMap<string, MainTier1ExtrasState>>(() => new Map());
  const currentRef = useRef<MainTier1ExtrasState | null>(null);
  const setMainTier1Extras = useCallback((next: MainTier1ExtrasState | null, onlyIfCurrent?: MainTier1ExtrasState) => {
    const prev = currentRef.current;
    if (next != null) {
      if (next.pathname != null) {
        const key = normalizeAppPathnameForTier1(next.pathname);
        setByPath((m) => {
          if (sameOrEqual(m.get(key), next)) return m;
          const copy = new Map(m);
          copy.set(key, next);
          return copy;
        });
      }
      if (sameOrEqual(prev, next)) return;
      currentRef.current = next;
      setExtras(next);
      return;
    }
    /** 해제 — 해제 대상(내 등록, 없으면 지금 값)의 경로별 값도 지운다 */
    const target = onlyIfCurrent ?? prev;
    if (target?.pathname != null) {
      const key = normalizeAppPathnameForTier1(target.pathname);
      setByPath((m) => {
        if (!sameOrEqual(m.get(key), target)) return m;
        const copy = new Map(m);
        copy.delete(key);
        return copy;
      });
    }
    if (prev == null) return;
    if (onlyIfCurrent && !sameOrEqual(prev, onlyIfCurrent)) return;
    currentRef.current = null;
    setExtras(null);
  }, []);

  return (
    <MainTier1ExtrasSetterContext.Provider value={setMainTier1Extras}>
      <MainTier1ExtrasStateContext.Provider value={extras}>
        <MainTier1ExtrasByPathContext.Provider value={byPath}>{children}</MainTier1ExtrasByPathContext.Provider>
      </MainTier1ExtrasStateContext.Provider>
    </MainTier1ExtrasSetterContext.Provider>
  );
}

/** Provider 없으면 `null` — 폴백 UI용 (extras·setter 모두 구독) */
export function useMainTier1ExtrasOptional(): MainTier1ExtrasContextValue | null {
  const extras = useContext(MainTier1ExtrasStateContext);
  const setMainTier1Extras = useContext(MainTier1ExtrasSetterContext);
  return useMemo(() => {
    if (!setMainTier1Extras) return null;
    return { extras, setMainTier1Extras };
  }, [extras, setMainTier1Extras]);
}

/**
 * setter 전용 — `extras` 변경 시 리렌더하지 않음.
 * `useLayoutEffect` 의존성에는 이 훅 반환값만 넣을 것(참조 안정).
 */
export function useSetMainTier1ExtrasOptional(): MainTier1ExtrasContextValue["setMainTier1Extras"] | null {
  return useContext(MainTier1ExtrasSetterContext);
}

/**
 * S4 두 칸 목록 칸 머리글 범위 — 이 안의 머리글 부품은 이 허브 주소로 등록된 extras 를 읽는다.
 */
const MainTier1ExtrasHubScopeContext = createContext<string | null>(null);

export function MainTier1ExtrasHubScope({ hubPath, children }: { hubPath: string; children: ReactNode }) {
  return <MainTier1ExtrasHubScopeContext.Provider value={hubPath}>{children}</MainTier1ExtrasHubScopeContext.Provider>;
}

/**
 * 머리글 부품(1단 머리글·1단 줄·허브 1단 오른쪽 칸)이 읽는 extras.
 * - 허브 범위(두 칸 목록 칸) 안: 그 허브 주소의 등록값.
 * - 그 밖: 마지막 등록이 이 경로에 해당하면 그 값(지금과 같음), 아니면 이 경로로 등록돼 있는 값(두 칸에서 다른 칸이
 *   마지막으로 등록한 경우), 둘 다 없으면 null(경로 표 제목).
 */
export function useHeaderScopedMainTier1Extras(pathname: string | null | undefined): MainTier1ExtrasState | null {
  const hubPath = useContext(MainTier1ExtrasHubScopeContext);
  const shared = useContext(MainTier1ExtrasStateContext);
  const byPath = useContext(MainTier1ExtrasByPathContext);
  if (hubPath) return byPath?.get(normalizeAppPathnameForTier1(hubPath)) ?? null;
  const filtered = mainTier1ExtrasForPathname(shared, pathname);
  if (filtered) return filtered;
  if (!pathname || !byPath) return null;
  return byPath.get(normalizeAppPathnameForTier1(pathname)) ?? null;
}
