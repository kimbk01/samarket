"use client";

import { createContext, useContext } from "react";
import type { MessengerFriendAddSheetFriendActions } from "@/components/community-messenger/MessengerFriendAddSheet";

/**
 * 메신저 홈의 친구 요청 상태·행동 — 친구 추가 시트와 친구 탭 인라인 검색이 같은 검색 결과 행을 쓰도록 공유.
 * (1단계 문서 §3-2 ① · F-1: 모든 사용자 검색 경로에서 상태별 버튼 + 행 탭 → 프로필)
 */
export type MessengerFriendActionsContextValue = MessengerFriendAddSheetFriendActions & {
  viewerUserId: string | null;
};

const MessengerFriendActionsContext = createContext<MessengerFriendActionsContextValue | null>(null);

export const MessengerFriendActionsProvider = MessengerFriendActionsContext.Provider;

export function useMessengerFriendActions(): MessengerFriendActionsContextValue | null {
  return useContext(MessengerFriendActionsContext);
}
