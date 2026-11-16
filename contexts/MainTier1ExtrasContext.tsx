"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
  setMainTier1Extras: (next: MainTier1ExtrasState | null) => void;
};

const MainTier1ExtrasStateContext = createContext<MainTier1ExtrasState | null>(null);
const MainTier1ExtrasSetterContext = createContext<
  MainTier1ExtrasContextValue["setMainTier1Extras"] | null
>(null);

export function MainTier1ExtrasProvider({ children }: { children: ReactNode }) {
  const [extras, setExtras] = useState<MainTier1ExtrasState | null>(null);
  const setMainTier1Extras = useCallback((next: MainTier1ExtrasState | null) => {
    setExtras((prev) => {
      if (prev === next) return prev;
      if (next == null) return prev == null ? prev : null;
      if (prev == null) return next;
      if (sameMainTier1ExtrasState(prev, next)) return prev;
      return next;
    });
  }, []);

  return (
    <MainTier1ExtrasSetterContext.Provider value={setMainTier1Extras}>
      <MainTier1ExtrasStateContext.Provider value={extras}>{children}</MainTier1ExtrasStateContext.Provider>
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
