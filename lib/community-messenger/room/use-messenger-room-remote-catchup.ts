"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { applyIncomingMessageEvent } from "@/lib/community-messenger/stores/messenger-realtime-store";
import {
  advanceMessengerRoomTimelineGap,
  buildCommunityMessengerMessagesAfterPath,
  clearMessengerRoomTimelineGap,
  MESSENGER_ROOM_CATCHUP_PAGE_LIMIT,
  peekMessengerRoomTimelineGap,
  runMessengerRoomAfterCatchUpPages,
  runMessengerRoomCatchUpSingleFlight,
  selectNewestConfirmedMessageAnchor,
  subscribeMessengerRoomTimelineGap,
} from "@/lib/community-messenger/room/messenger-room-catchup-anchor";
import { isOpenRoomTerminalCatchUpPendingForRoom } from "@/lib/community-messenger/realtime/global-messenger-room-bundle-channel";

import type { MessengerRoomBootstrapRefreshFn } from "@/lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle";

/** Hub tip after catch-up timeline merge — SSOT via applyIncomingMessageEvent → projectRoomActivityToHomeList. */
function projectHubTipAfterCatchUpMerge(args: {
  viewerUserId: string | null | undefined;
  roomId: string;
  message: CommunityMessengerMessage;
  roomSummary?: CommunityMessengerRoomSnapshot["room"] | null;
}): void {
  const rid = String(args.roomId ?? "").trim();
  const mid = String(args.message?.id ?? "").trim();
  if (!rid || !mid) return;
  applyIncomingMessageEvent({
    viewerUserId: args.viewerUserId?.trim() || null,
    roomId: rid,
    roomSummary: args.roomSummary ?? undefined,
    message: args.message,
    messageRow: {
      id: args.message.id,
      room_id: rid,
      sender_id: args.message.senderId,
      message_type: args.message.messageType,
      content: args.message.content,
      metadata: args.message.metadata ?? null,
      created_at: args.message.createdAt,
    },
  });
}

export type MessengerRoomBootstrapRefresh = MessengerRoomBootstrapRefreshFn;

/**
 * 탭 복귀·bump 후 증분 동기화: `after=` 페이지 및 단건 GET 재시도.
 * `useMessengerRoomClientPhase1` 의 catch-up `useCallback` 3개를 그대로 옮김.
 */
export function useMessengerRoomRemoteCatchup({
  roomId,
  streamRoomId,
  refresh,
  snapshotRef,
  roomMessagesRef,
  setRoomMessages,
}: {
  roomId: string;
  streamRoomId: string;
  refresh: MessengerRoomBootstrapRefresh;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMessagesRef: MutableRefObject<Array<CommunityMessengerMessage & { pending?: boolean }>>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
}): {
  catchUpNewerMessages: (opts?: { anchorId?: string | null }) => Promise<boolean>;
  catchUpAfterRemoteBump: (
    hintMessageId?: string | null,
    opts?: { alreadyMergedSnapshot?: boolean }
  ) => Promise<void>;
} {
  /**
   * `after=` 증분 — `hasMore` 를 따라 페이지 단위로 이어 받는다(상한 MESSENGER_ROOM_CATCHUP_MAX_PAGES).
   * `opts.anchorId` 가 주어지면 그 앵커부터(bump 단건 병합 전 앵커 · 재입장 갭 앵커) — 그 사이 누락 행 회수.
   * 반환: 1건 이상 병합했는지 (기존 계약 유지 — false 면 호출부가 refresh fallback).
   */
  const catchUpNewerMessages = useCallback(async (opts?: { anchorId?: string | null }): Promise<boolean> => {
    const id = (snapshotRef.current?.room?.id?.trim() || roomId?.trim() || "").trim();
    if (!id) return false;
    let anchorId = typeof opts?.anchorId === "string" ? opts.anchorId.trim() : "";
    if (!anchorId || !isUuidLikeString(anchorId)) {
      const confirmed = roomMessagesRef.current.filter((m) => !m.pending);
      if (confirmed.length === 0) {
        return false;
      }
      anchorId = selectNewestConfirmedMessageAnchor(confirmed) ?? "";
    }
    if (!anchorId) {
      return false;
    }
    const startAnchorId = anchorId;
    return runMessengerRoomCatchUpSingleFlight(id, startAnchorId, async () => {
      const viewer = snapshotRef.current?.viewerUserId?.trim() || null;
      const roomSummary = snapshotRef.current?.room ?? null;
      const result = await runMessengerRoomAfterCatchUpPages<CommunityMessengerMessage>({
        startAnchorId,
        fetchPage: async (after) => {
          const res = await fetch(buildCommunityMessengerMessagesAfterPath(id, after, MESSENGER_ROOM_CATCHUP_PAGE_LIMIT), {
            cache: "no-store",
            credentials: "include",
          });
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            messages?: CommunityMessengerMessage[];
            hasMore?: boolean;
          };
          return {
            ok: res.ok && json.ok === true && Array.isArray(json.messages),
            status: res.status,
            messages: Array.isArray(json.messages) ? json.messages : [],
            hasMore: json.hasMore === true,
          };
        },
        onPage: (incoming) => {
          setRoomMessages((prev) => mergeRoomMessages(prev, incoming));
          for (const row of incoming) {
            projectHubTipAfterCatchUpMerge({
              viewerUserId: viewer,
              roomId: id,
              message: row,
              roomSummary,
            });
          }
        },
      });
      if (result.ok && !result.complete && result.lastAnchorId && result.lastAnchorId !== startAnchorId) {
        /** 상한 초과(400행+) — 진행 지점을 갭으로 남겨 다음 트리거(이벤트)가 이어 받는다(폴링 아님). */
        advanceMessengerRoomTimelineGap(id, startAnchorId, result.lastAnchorId, result.lastAnchorCreatedAt);
      } else if (result.ok && result.complete) {
        clearMessengerRoomTimelineGap(id, startAnchorId);
      }
      return result.mergedCount > 0;
    });
  }, [roomId]);

  const tryMergeSingleMessageFromBump = useCallback(async (messageId: string): Promise<boolean> => {
    const mid = String(messageId ?? "").trim();
    if (!mid || !isUuidLikeString(mid)) return false;
    /**
     * INSERT 직후 단건 GET 이 404/5xx 면 복제·커밋 레이스 가능 — 짧은 간격으로만 재시도.
     * (분당 72회 한도: 404/503 등에만 재시도·상한으로 폭주 방지)
     */
    const maxAttempts = 14;
    const gapMs = 130;
    for (let i = 0; i < maxAttempts; i++) {
      const rid = (snapshotRef.current?.room?.id?.trim() || streamRoomId?.trim() || "").trim();
      if (!rid) return false;
      try {
        const res = await fetch(
          `${communityMessengerRoomResourcePath(rid)}/messages/${encodeURIComponent(mid)}`,
          { cache: "no-store", credentials: "include" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: CommunityMessengerMessage;
        };
        if (res.ok && json.ok && json.message) {
          const row = json.message;
          setRoomMessages((prev) => mergeRoomMessages(prev, [row]));
          projectHubTipAfterCatchUpMerge({
            viewerUserId: snapshotRef.current?.viewerUserId,
            roomId: rid,
            message: row,
            roomSummary: snapshotRef.current?.room ?? null,
          });
          return true;
        }
        const retryable = res.status === 404 || res.status === 503 || res.status >= 500;
        if (!retryable || i + 1 >= maxAttempts) return false;
      } catch {
        if (i + 1 >= maxAttempts) return false;
      }
      await new Promise<void>((r) => setTimeout(r, gapMs));
    }
    return false;
  }, [streamRoomId]);

  /**
   * Remote bump = invalidation signal (not status authority).
   * Always reconcile by message id when hinted — `after=` only finds newer INSERTs, never
   * same-id metadata UPDATEs. Snapshot merge (if any) is acceleration only.
   */
  const catchUpAfterRemoteBump = useCallback(
    async (hintMessageId?: string | null, _opts?: { alreadyMergedSnapshot?: boolean }) => {
      const hint = typeof hintMessageId === "string" ? hintMessageId.trim() : "";
      /**
       * M-1: 단건 병합 **전** 앵커를 잡아 둔다 — 단건 병합 후 앵커가 최신으로 넘어가면
       * 그 사이 Realtime 누락분(이전 bump 힌트 폐기 포함)이 `after=` 에서 영구 제외되던 결함.
       */
      const preMergeAnchor =
        selectNewestConfirmedMessageAnchor(roomMessagesRef.current.filter((m) => !m.pending)) ?? "";
      if (hint && (await tryMergeSingleMessageFromBump(hint))) {
        if (preMergeAnchor && preMergeAnchor !== hint) {
          void catchUpNewerMessages({ anchorId: preMergeAnchor });
        }
        const merged = roomMessagesRef.current.find((m) => String(m.id ?? "").trim() === hint);
        const meta =
          merged?.metadata && typeof merged.metadata === "object"
            ? (merged.metadata as { domain?: unknown; orderStatus?: unknown })
            : null;
        if (meta?.domain === "store_order" && meta.orderStatus) {
          void refresh(true, { triggerReason: "store_order_status_bump" });
        }
        return;
      }
      /**
       * CUT-B: when open-room terminal catch-up already owns this burst, skip duplicate
       * after=/silent_delta. messages/{id} above remains the CUT-1 same-id path.
       * Miss/fallback: no pending coalesce → full catch-up below.
       */
      const pendingRoom = (snapshotRef.current?.room?.id?.trim() || streamRoomId?.trim() || roomId?.trim() || "").trim();
      if (pendingRoom && isOpenRoomTerminalCatchUpPendingForRoom(pendingRoom)) {
        return;
      }
      const backoffMs = [14, 32, 72];
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await new Promise<void>((r) => setTimeout(r, backoffMs[attempt - 1] ?? 72));
        }
        const ok = await catchUpNewerMessages();
        if (ok) return;
      }
      void refresh(true, { triggerReason: "realtime_bump_catchup" });
    },
    [catchUpNewerMessages, refresh, roomMessagesRef, tryMergeSingleMessageFromBump]
  );

  /**
   * M-3: 재입장·재실행 시 로컬 창(이전)과 서버 최신 창 사이 갭이 등록되면(`noteMessengerRoomTimelineGapFromWindows`)
   * 그 앵커부터 `after=` 로 메운다 — 이벤트 기반 1회, 폴링 아님.
   */
  useEffect(() => {
    const roomKey = () => (snapshotRef.current?.room?.id?.trim() || streamRoomId?.trim() || roomId?.trim() || "").trim();
    const run = (rid: string) => {
      const cur = roomKey();
      if (!cur || rid !== cur) return;
      const gapAnchor = peekMessengerRoomTimelineGap(rid);
      if (!gapAnchor) return;
      void catchUpNewerMessages({ anchorId: gapAnchor });
    };
    const unsub = subscribeMessengerRoomTimelineGap(run);
    const initial = roomKey();
    if (initial) run(initial);
    return unsub;
  }, [catchUpNewerMessages, roomId, snapshotRef, streamRoomId]);

  return { catchUpNewerMessages, catchUpAfterRemoteBump };
}
