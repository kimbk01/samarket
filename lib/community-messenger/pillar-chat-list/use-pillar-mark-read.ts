"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  buildCommunityMessengerMarkReadPatchBody,
  communityMessengerMarkReadFetchInitBase,
  parseCommunityMessengerMarkReadResponse,
} from "@/lib/community-messenger/room/community-messenger-mark-read-fetch";
import {
  runPillarMarkAllRead,
  type MarkAllReadTarget,
} from "@/lib/community-messenger/pillar-chat-list/pillar-chat-list-model";

/** 「모두 읽음」 진행 중 표시 — 행 단위 `read:{roomId}` 와 겹치지 않는 값 */
export const PILLAR_MARK_ALL_READ_BUSY_ID = "read:all";

/**
 * 거래·주문 채팅 목록 공용 — 방 하나 읽음. 목록 캐시에 낙관적 0 반영, 실패 시 원래 안 읽음 수로 되돌림.
 * 목록마다 다른 것은 캐시 패치 함수뿐이다(거래 = trade list patch, 주문 = store order list patch).
 */
export function usePillarRoomMarkRead(args: {
  resolveViewerUserId: () => string;
  applyReadPatch: (input: { viewerUserId: string; roomId: string }) => void;
  applyUnreadRestorePatch: (input: {
    viewerUserId: string;
    roomId: string;
    unreadCount: number;
    mutationType: "PARTICIPANT_UNREAD";
  }) => void;
}): (roomId: string, preUnread: number) => Promise<boolean> {
  const { resolveViewerUserId, applyReadPatch, applyUnreadRestorePatch } = args;
  return useCallback(
    async (roomId: string, preUnread: number): Promise<boolean> => {
      const viewerUserId = resolveViewerUserId();
      if (viewerUserId) applyReadPatch({ viewerUserId, roomId });
      const restore = () => {
        if (viewerUserId && preUnread > 0) {
          applyUnreadRestorePatch({
            viewerUserId,
            roomId,
            unreadCount: preUnread,
            mutationType: "PARTICIPANT_UNREAD",
          });
        }
      };
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          ...communityMessengerMarkReadFetchInitBase,
          body: JSON.stringify(buildCommunityMessengerMarkReadPatchBody()),
        });
        const parsed = await parseCommunityMessengerMarkReadResponse(res);
        if (!parsed.okHttp || parsed.json.ok !== true) {
          restore();
          return false;
        }
        return true;
      } catch {
        restore();
        return false;
      }
    },
    [applyReadPatch, applyUnreadRestorePatch, resolveViewerUserId]
  );
}

/**
 * 머리글 「모두 읽음」 — 안 읽은 방만 동시 4개씩 읽음 처리 (주문 채팅 목록에서 쓰던 방식 그대로, 거래 채팅 목록도 같은 훅).
 * 일부라도 실패하면 `failureMessage` 를 오류 줄에 띄운다.
 */
export function usePillarMarkAllRead(args: {
  rows: readonly MarkAllReadTarget[] | null | undefined;
  markRoomReadById: (roomId: string, preUnread: number) => Promise<boolean>;
  setBusyId: Dispatch<SetStateAction<string | null>>;
  setActionError: Dispatch<SetStateAction<string | null>>;
  failureMessage: string;
}): () => Promise<void> {
  const { rows, markRoomReadById, setBusyId, setActionError, failureMessage } = args;
  return useCallback(async () => {
    const list = rows ?? [];
    if (!list.some((r) => r.unreadCount > 0)) return;
    setBusyId(PILLAR_MARK_ALL_READ_BUSY_ID);
    setActionError(null);
    try {
      const { failed } = await runPillarMarkAllRead(list, markRoomReadById);
      if (failed > 0) setActionError(failureMessage);
    } finally {
      setBusyId(null);
    }
  }, [failureMessage, markRoomReadById, rows, setActionError, setBusyId]);
}
