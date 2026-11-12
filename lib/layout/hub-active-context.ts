"use client";

import { createContext, useContext } from "react";

/**
 * D1 S2 (Owner 승인 2026-11-12 · `docs/audit/d1-root-cause-total-design-2026-11-12.md` §2 S2)
 * 하단 탭 보관 허브의 「지금 보이는가」 신호.
 *
 * 보관대(`HubRetentionStack`)는 숨긴 허브를 React `Activity` 대신 CSS(`display:none`)로 숨긴다 — 다시 보일 때 React 가
 * 하위 효과 전체를 끊고 다시 연결하는 비용(샤오미 약 57ms)이 없어진다. 대신 **숨김 중 돌면 안 되는 효과**는 이 신호로
 * 직접 멈춘다(분류표 `docs/audit/d1-s2-hub-effects-inventory-2026-11-12.md` 의 HIGH 행):
 * 네트워크·광고 집계·타이머·공용 스크롤/창/키보드 리스너·셸 머리글/오버레이 등록·화면 이동.
 *
 * 쓰는 법: `const hubActive = useHubActive();` → 효과 첫 줄 `if (!hubActive) return;` + 의존성에 `hubActive`.
 * 숨기면 그 효과가 정리되고, 다시 보이면 다시 실행된다(Activity 와 같은 의미 — 60초 규칙 판정도 그대로).
 *
 * 보관 허브 밖(글 상세·대화방·관리자 등 모든 다른 화면)은 Provider 가 없으므로 항상 `true` — 동작 변화 없음.
 */
export const HubActiveContext = createContext<boolean>(true);

export function useHubActive(): boolean {
  return useContext(HubActiveContext);
}

/** 숨긴 허브용 빈 구독 — `useSyncExternalStore(hubActive ? subscribeX : noopHubSubscribe, …)`(구독이 네트워크를 시작하는 저장소) */
export function noopHubSubscribe(): () => void {
  return () => {};
}
