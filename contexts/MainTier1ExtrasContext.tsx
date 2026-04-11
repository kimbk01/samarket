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
  /** 있으면 좌측 뒤로 버튼 대체(글쓰기 취소 확인 등) */
  leftSlot?: ReactNode;
};

export type MainTier1ExtrasState = {
  tier1?: MainTier1Partial;
  /** `MyManagedCtaStrip`용 */
  ctaLinks?: { href: string; label: string }[];
  stickyBelow?: ReactNode;
};

type MainTier1ExtrasContextValue = {
  extras: MainTier1ExtrasState | null;
  setMainTier1Extras: (next: MainTier1ExtrasState | null) => void;
};

const MainTier1ExtrasContext = createContext<MainTier1ExtrasContextValue | null>(null);

export function MainTier1ExtrasProvider({ children }: { children: ReactNode }) {
  const [extras, setExtras] = useState<MainTier1ExtrasState | null>(null);
  const setMainTier1Extras = useCallback((next: MainTier1ExtrasState | null) => {
    setExtras(next);
  }, []);
  const value = useMemo(
    () => ({ extras, setMainTier1Extras }),
    [extras, setMainTier1Extras]
  );
  return (
    <MainTier1ExtrasContext.Provider value={value}>{children}</MainTier1ExtrasContext.Provider>
  );
}

/** Provider 없으면 `null` — 폴백 UI용 */
export function useMainTier1ExtrasOptional(): MainTier1ExtrasContextValue | null {
  return useContext(MainTier1ExtrasContext);
}

/**
 * `extras`가 바뀔 때마다 컨텍스트 객체 참조가 바뀌므로,
 * `useLayoutEffect` 의존성에 전체 컨텍스트를 넣으면 `setMainTier1Extras` 호출 → 무한 루프가 난다.
 * 이 훅의 반환 setter만 의존성에 넣을 것(참조 안정).
 */
export function useSetMainTier1ExtrasOptional(): MainTier1ExtrasContextValue["setMainTier1Extras"] | null {
  return useContext(MainTier1ExtrasContext)?.setMainTier1Extras ?? null;
}
