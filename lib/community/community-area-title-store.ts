"use client";

import { useSyncExternalStore } from "react";

/**
 * 정보교환 1단 제목 뒤 「· 동네 ⌄」(Owner 「3판대로 구현」 2026-11-12, 설계 `docs/design/community-header-4items-design-2026-11-12.md` §2-2).
 *
 * 「보는 동네」 상태(`useCommunityLocalFilter`)와 시트는 피드(`CommunityFeed`)가 하나로 가진다.
 * 1단은 피드가 알려 준 동네 이름만 읽고, 누르면 피드에 「시트 열기」 신호만 보낸다 — 1단에 두 번째 상태·시트를 두지 않는다.
 */
export const COMMUNITY_AREA_SHEET_OPEN_EVENT = "dibay:community-area-sheet-open";

type CommunityAreaTitleState = {
  /** 보는 동네 이름(시·군). 아직 모르거나 비회원이면 빈 문자열 */
  label: string;
  /** 동네 글만 보는 중인가 — 피드가 아직 안 붙었으면 null(1단이 주소 값으로 판단) */
  active: boolean | null;
};

let state: CommunityAreaTitleState = { label: "", active: null };
const listeners = new Set<() => void>();

export function publishCommunityAreaTitle(label: string, active: boolean | null): void {
  const next = label.trim();
  if (next === state.label && active === state.active) return;
  state = { label: next, active };
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => state;

export function useCommunityAreaTitle(): CommunityAreaTitleState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function requestOpenCommunityAreaSheet(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COMMUNITY_AREA_SHEET_OPEN_EVENT));
}
