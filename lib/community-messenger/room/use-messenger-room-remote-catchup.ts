"use client";

import { useCallback, type MutableRefObject } from "react";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import type { MessengerRoomBootstrapRefreshFn } from "@/lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle";
import {
  authorityApplyCatchUp,
  authorityGetMessages,
} from "@/lib/community-messenger/room/message-authority/message-authority";
import type { RoomTimelineMessage } from "@/lib/community-messenger/room/message-authority/room-message-store";

export type MessengerRoomBootstrapRefresh = MessengerRoomBootstrapRefreshFn;

/**
 * Catch-up: missing ids only via Message Authority. No React setRoomMessages / merge replace.
 */
export function useMessengerRoomRemoteCatchup({
  roomId,
  streamRoomId,
  snapshotRef,
  roomMessagesRef,
}: {
  roomId: string;
  streamRoomId: string;
  refresh?: MessengerRoomBootstrapRefresh;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMessagesRef: MutableRefObject<RoomTimelineMessage[]>;
  /** @deprecated ignored — Authority is sole writer */
  setRoomMessages?: unknown;
}): {
  catchUpNewerMessages: () => Promise<boolean>;
  catchUpAfterRemoteBump: (
    hintMessageId?: string | null,
    opts?: { alreadyMergedSnapshot?: boolean }
  ) => Promise<void>;
} {
  const catchUpNewerMessages = useCallback(async (): Promise<boolean> => {
    const id = (snapshotRef.current?.room?.id?.trim() || roomId?.trim() || "").trim();
    if (!id) return false;
    const live = authorityGetMessages(id);
    roomMessagesRef.current = live;
    const confirmed = live.filter((m) => !m.pending);
    if (confirmed.length === 0) {
      return false;
    }
    let anchorId: string | null = null;
    let bestTime = -Infinity;
    let bestIdForTie = "";
    for (const m of confirmed) {
      const mid = String(m?.id ?? "").trim();
      if (!mid || mid.startsWith("pending:") || !isUuidLikeString(mid)) continue;
      const t = new Date(m.createdAt).getTime();
      if (!Number.isFinite(t)) continue;
      if (t > bestTime || (t === bestTime && mid > bestIdForTie)) {
        bestTime = t;
        anchorId = mid;
        bestIdForTie = mid;
      }
    }
    if (!anchorId) {
      return false;
    }
    try {
      const res = await fetch(
        `${communityMessengerRoomResourcePath(id)}/messages?after=${encodeURIComponent(anchorId)}&limit=80`,
        { cache: "no-store", credentials: "include" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        messages?: CommunityMessengerMessage[];
      };
      if (!res.ok || !json.ok || !Array.isArray(json.messages) || json.messages.length === 0) return false;
      const appended = authorityApplyCatchUp(id, json.messages);
      roomMessagesRef.current = authorityGetMessages(id);
      return appended > 0;
    } catch {
      /* ignore */
    }
    return false;
  }, [roomId, roomMessagesRef, snapshotRef]);

  const tryMergeSingleMessageFromBump = useCallback(
    async (messageId: string): Promise<boolean> => {
      const rid = (snapshotRef.current?.room?.id?.trim() || streamRoomId?.trim() || roomId?.trim() || "").trim();
      const mid = messageId.trim();
      if (!rid || !mid || !isUuidLikeString(mid)) return false;
      try {
        const res = await fetch(
          `${communityMessengerRoomResourcePath(rid)}/messages/${encodeURIComponent(mid)}`,
          { cache: "no-store", credentials: "include" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: CommunityMessengerMessage;
        };
        if (!res.ok || !json.ok || !json.message?.id) return false;
        const n = authorityApplyCatchUp(rid, [json.message]);
        roomMessagesRef.current = authorityGetMessages(rid);
        return n > 0 || authorityGetMessages(rid).some((m) => m.id === json.message!.id);
      } catch {
        return false;
      }
    },
    [roomId, roomMessagesRef, snapshotRef, streamRoomId]
  );

  const catchUpAfterRemoteBump = useCallback(
    async (hintMessageId?: string | null, opts?: { alreadyMergedSnapshot?: boolean }) => {
      if (opts?.alreadyMergedSnapshot) return;
      const hint = hintMessageId?.trim();
      if (hint) {
        const ok = await tryMergeSingleMessageFromBump(hint);
        if (ok) return;
      }
      await catchUpNewerMessages();
      /** DO NOT refresh(true) timeline rewrite on miss — Authority catch-up only. */
    },
    [catchUpNewerMessages, tryMergeSingleMessageFromBump]
  );

  return { catchUpNewerMessages, catchUpAfterRemoteBump };
}
