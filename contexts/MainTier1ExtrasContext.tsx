"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
};

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
    a.stickyBelow === b.stickyBelow
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
