"use client";

import { createContext, useContext } from "react";
import type { MessengerFriendAddSheetFriendActions } from "@/components/community-messenger/MessengerFriendAddSheet";

/**
 * 메신저 홈의 친구 요청 상태·행동 — 친구 추가 시트와 친구 탭 인라인 검색이 같은 검색 결과 행을 쓰도록 공유.
 * (1단계 문서 §3-2 ① · F-1: 모든 사용자 검색 경로에서 상태별 버튼 + 행 탭 → 프로필)
 */
export type MessengerFriendActionsContextValue = MessengerFriendAddSheetFriendActions & {
  viewerUserId: string | null;
  /**
   * §15-3: 대화·통화 불가 상대(내가 차단 ∪ 내 요청을 거절) — 목록 행 빨간 금지 배지.
   * 서버 목록을 받기 전에는 undefined(모름) → 금지 배지 없음(오판 금지).
   */
  unavailablePeerIds?: ReadonlySet<string>;
};

const MessengerFriendActionsContext = createContext<MessengerFriendActionsContextValue | null>(null);

export const MessengerFriendActionsProvider = MessengerFriendActionsContext.Provider;

export function useMessengerFriendActions(): MessengerFriendActionsContextValue | null {
  return useContext(MessengerFriendActionsContext);
}
