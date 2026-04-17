"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import type { CommunityMessengerMessage, CommunityMessengerProfileLite, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  communityMessengerBumpKnownRoomIds,
  communityMessengerBumpPayloadMatchesKnownRooms,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";
import { parseCommunityMessengerBumpMessageSnapshot } from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeCommunityMessengerRoomBumpBroadcast } from "@/lib/community-messenger/realtime/room-bump-broadcast";

/**
 * Broadcast v2 bump — postgres_changes 누락 시에도 방 단위로 증분 동기화.
 * `useMessengerRoomClientPhase1` 의 bump `useEffect` 본문·deps 그대로.
 */
export function useMessengerRoomBumpBroadcastSubscription({
  roomId,
  streamRoomId,
  roomReadyForRealtime,
  snapshot,
  initialServerSnapshot,
  snapshotRef,
  roomMembersDisplayRef,
  remoteBumpCatchUpRafRef,
  lastRemoteBumpDedupeRef,
  setRoomMessages,
  catchUpAfterRemoteBump,
}: {
  roomId: string;
  streamRoomId: string;
  roomReadyForRealtime: boolean;
  snapshot: CommunityMessengerRoomSnapshot | null;
  initialServerSnapshot: CommunityMessengerRoomSnapshot | null;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMembersDisplayRef: MutableRefObject<CommunityMessengerProfileLite[]>;
  remoteBumpCatchUpRafRef: MutableRefObject<number | null>;
  lastRemoteBumpDedupeRef: MutableRefObject<string>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
  catchUpAfterRemoteBump: (hintMessageId?: string | null) => Promise<void>;
}): void {
  /**
   * `postgres_changes` 가 publication/RLS/세션 타이밍 문제로 누락돼도,
   * 방 단위 Broadcast bump 신호로 즉시 증분 동기화한다.
   */
  useEffect(() => {
    const viewer =
      snapshot?.viewerUserId?.trim() ?? initialServerSnapshot?.viewerUserId?.trim() ?? "";
    if (!viewer || !roomReadyForRealtime) return;

    const route = String(roomId ?? "").trim();
    const stream = String(streamRoomId ?? "").trim();
    const snapRoom = String(snapshot?.room?.id ?? "").trim();
    const bumpSubscribeIds = communityMessengerBumpKnownRoomIds({
      routeRoomId: route,
      streamRoomId: stream || route,
      snapshotRoomId: snapRoom || null,
    });
    if (bumpSubscribeIds.size === 0) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    const channels: ReturnType<typeof subscribeCommunityMessengerRoomBumpBroadcast>[] = [];

    const onBump = (payload: Record<string, unknown>) => {
      const known = communityMessengerBumpKnownRoomIds({
        routeRoomId: String(roomId ?? "").trim(),
        streamRoomId: String(streamRoomId ?? "").trim(),
        snapshotRoomId: snapshotRef.current?.room?.id ?? null,
      });
      if (!communityMessengerBumpPayloadMatchesKnownRooms(payload, known)) return;

      const from = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
      // 내 bump는 이미 optimistic/confirm 처리되므로 스킵.
      if (from && from === viewer) return;

      const hint =
        typeof payload.messageId === "string"
          ? payload.messageId.trim()
          : typeof (payload as { message_id?: unknown }).message_id === "string"
            ? String((payload as { message_id: string }).message_id).trim()
            : "";
      const at = typeof payload.at === "string" ? payload.at.trim() : "";
      const dedupeKey = `${from}|${hint || "no-mid"}|${at}`;
      if (lastRemoteBumpDedupeRef.current === dedupeKey) return;
      lastRemoteBumpDedupeRef.current = dedupeKey;

      if (remoteBumpCatchUpRafRef.current != null) {
        cancelAnimationFrame(remoteBumpCatchUpRafRef.current);
      }
      remoteBumpCatchUpRafRef.current = requestAnimationFrame(() => {
        remoteBumpCatchUpRafRef.current = null;
        const pre = parseCommunityMessengerBumpMessageSnapshot(payload, viewer);
        if (pre) {
          const member = roomMembersDisplayRef.current.find((m) => messengerUserIdsEqual(m.id, pre.senderId ?? ""));
          const enriched =
            member?.label && member.label.trim().length > 0 ? { ...pre, senderLabel: member.label } : pre;
          setRoomMessages((prev) => mergeRoomMessages(prev, [enriched]));
        }
        void catchUpAfterRemoteBump(hint || undefined);
      });
    };

    for (const rid of bumpSubscribeIds) {
      channels.push(
        subscribeCommunityMessengerRoomBumpBroadcast({
          sb,
          roomId: rid,
          onBump,
        })
      );
    }

    return () => {
      lastRemoteBumpDedupeRef.current = "";
      if (remoteBumpCatchUpRafRef.current != null) {
        cancelAnimationFrame(remoteBumpCatchUpRafRef.current);
        remoteBumpCatchUpRafRef.current = null;
      }
      for (const ch of channels) {
        try {
          void sb.removeChannel(ch);
        } catch {
          /* ignore */
        }
      }
    };
  }, [
    catchUpAfterRemoteBump,
    initialServerSnapshot?.viewerUserId,
    roomId,
    roomReadyForRealtime,
    snapshot?.room?.id,
    snapshot?.viewerUserId,
    streamRoomId,
  ]);
}
