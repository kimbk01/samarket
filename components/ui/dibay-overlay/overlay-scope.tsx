"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * 포털 스코프 전달 — 시트·다이얼로그는 `document.body` 로 포털되어 화면 스코프(`data-biz`·배달 소비자·주문 내역)
 * 밖에서 그려진다. 스코프 CSS 변수·규칙이 포털 안에서도 같게 적용되도록, 화면 셸이 이 Provider 로 속성을 내려주면
 * `DibayOverlayRoot`·도메인 전용 포털이 자기 루트 요소에 그대로 붙인다.
 *
 * Provider 가 없는 화면(메신저·거래·커뮤니티 등)은 빈 속성 → 기존과 동일.
 */
export type OverlayScopeAttrs = Readonly<Record<`data-${string}`, string>>;

const EMPTY: OverlayScopeAttrs = Object.freeze({});

const OverlayScopeContext = createContext<OverlayScopeAttrs>(EMPTY);

export function OverlayScopeProvider({ attrs, children }: { attrs: OverlayScopeAttrs | null; children: ReactNode }) {
  const parent = useContext(OverlayScopeContext);
  /** 안쪽 셸이 같은 키를 다시 주면 안쪽 값 우선 (예: `/stores` 소비자 셸 안의 사장님 셸) */
  const value = useMemo(() => (attrs ? { ...parent, ...attrs } : parent), [attrs, parent]);
  return <OverlayScopeContext.Provider value={value}>{children}</OverlayScopeContext.Provider>;
}

/** 포털 루트 요소에 spread 할 스코프 속성 */
export function useOverlayScopeAttrs(): OverlayScopeAttrs {
  return useContext(OverlayScopeContext);
}
