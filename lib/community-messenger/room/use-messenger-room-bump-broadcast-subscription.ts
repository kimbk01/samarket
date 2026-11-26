"use client";

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import type { CommunityMessengerMessage, CommunityMessengerProfileLite, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  communityMessengerBumpKnownRoomIds,
  communityMessengerBumpPayloadMatchesKnownRooms,
  communityMessengerRoomBumpChannelName,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";
import {
  releaseSupervisedMessengerChannel,
  whenMessengerTopicFree,
} from "@/lib/community-messenger/realtime/messenger-channel-topic-lease";
import type { SubscribeWithRetryHandle } from "@/lib/community-messenger/realtime/cm-rt-channel-registry";
import { parseCommunityMessengerBumpMessageSnapshot } from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import { resolveRoomBumpDedupeKey } from "@/lib/chat-domain/realtime/domain-realtime-envelope";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeCommunityMessengerRoomBumpBroadcast } from "@/lib/community-messenger/realtime/room-bump-broadcast";
import {
  applyIncomingMessageEvent,
  messengerIncomingMessageAlreadyTracked,
  removeMessengerRealtimeRoomMessage,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import { resolveOwnRoomBumpDecision } from "@/lib/community-messenger/room/own-room-bump-origin-policy";
import { shouldSkipPeerBumpSingleGet } from "@/lib/community-messenger/room/peer-bump-snapshot-skip-policy";
import { removeMessageFromRoomSnapshotCache } from "@/lib/community-messenger/room-snapshot-cache";
import { forgetMessengerRoomClientBootstrapFlights } from "@/lib/community-messenger/room/messenger-room-bootstrap-refresh";
import { enqueueRoomBumpFrameItem } from "@/lib/community-messenger/room/queue-room-bump-frame";

type RoomBumpListener = {
  onBump: (payload: Record<string, unknown>) => void;
  /** 같은 토픽 이전 채널 제거를 기다린 뒤 다시 가입(SUBSCRIBED)했을 때 — 공백 구간 정합 1회 */
  onResync?: () => void;
};

type RoomBumpEntry = {
  listeners: Set<MutableRefObject<RoomBumpListener>>;
  stop: () => void;
};

const roomBumpEntries = new Map<string, RoomBumpEntry>();

function createRoomBumpEntry(key: string, roomIds: string[]): RoomBumpEntry {
  const sb = getSupabaseClient();
  const entry: RoomBumpEntry = {
    listeners: new Set(),
    stop: () => undefined,
  };
  /**
   * 비공개 토픽 SELECT 권한은 `community_messenger_rooms.id`(uuid) 토픽에만 부여된다.
   * 레거시 비-uuid 라우트 id 구독은 Unauthorized rejoin만 반복하므로 제외한다.
   */
  const authorizedRoomIds = roomIds.filter((rid) => isUuidLikeString(String(rid ?? "").trim()));
  if (!sb || authorizedRoomIds.length === 0) return entry;

  /**
   * X4: 같은 방 빠른 재진입·effect 재실행 때 같은 토픽을 await 없이 다시 만들면 leaving 객체를 받아 조용히 죽는다.
   * 이전 제거 완료를 기다린 뒤 생성하고, 기다렸다면 첫 SUBSCRIBED 때 `after=` 정합 1회로 공백을 메운다.
   */
  let alive = true;
  const channels: Array<{ name: string; handle: SubscribeWithRetryHandle }> = [];
  for (const rid of authorizedRoomIds) {
    void (async () => {
      const waited = await whenMessengerTopicFree(sb, communityMessengerRoomBumpChannelName(rid));
      if (!alive) return;
      let resyncPending = waited;
      channels.push({
        name: communityMessengerRoomBumpChannelName(rid),
        handle: subscribeCommunityMessengerRoomBumpBroadcast({
          sb,
          roomId: rid,
          onBump: (payload) => {
            for (const listener of entry.listeners) {
              listener.current.onBump(payload);
            }
          },
          isCancelled: () => !alive,
          onStatus: (status) => {
            if (status !== "SUBSCRIBED" || !resyncPending) return;
            resyncPending = false;
            for (const listener of entry.listeners) {
              listener.current.onResync?.();
            }
          },
        }),
      });
    })();
  }

  entry.stop = () => {
    alive = false;
    for (const { name, handle } of channels) {
      /** 해제 기록 — 같은 방 빠른 재진입 때 `whenMessengerTopicFree` 가 true → 첫 SUBSCRIBED 에 공백 보상 1회(지금 동작) */
      releaseSupervisedMessengerChannel(name, handle);
    }
    channels.length = 0;
    roomBumpEntries.delete(key);
  };

  return entry;
}

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
  roomMessagesRef,
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
  /** 이 기기 타임라인(낙관 포함) — 내 bump 스킵 판정용 */
  roomMessagesRef: MutableRefObject<ReadonlyArray<CommunityMessengerMessage & { pending?: boolean }>>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
  catchUpAfterRemoteBump: (
    hintMessageId?: string | null,
    opts?: { alreadyMergedSnapshot?: boolean }
  ) => Promise<void>;
}): void {
  const listenerRef = useRef<RoomBumpListener>({ onBump: () => undefined });
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
    let lastCatchUpAt = 0;
    let catchUpTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingHint = "";
    let pendingAlreadyMergedSnapshot = false;
    const scheduleCatchUp = (hintMessageId: string, opts?: { alreadyMergedSnapshot?: boolean }) => {
      const now = Date.now();
      const elapsed = now - lastCatchUpAt;
      const minGap = 180;
      if (opts?.alreadyMergedSnapshot) pendingAlreadyMergedSnapshot = true;
      if (elapsed < minGap) {
        if (hintMessageId) pendingHint = hintMessageId;
        if (catchUpTimer != null) return;
        catchUpTimer = setTimeout(() => {
          catchUpTimer = null;
          lastCatchUpAt = Date.now();
          const h = pendingHint;
          const alreadyMergedSnapshot = pendingAlreadyMergedSnapshot;
          pendingHint = "";
          pendingAlreadyMergedSnapshot = false;
          void catchUpAfterRemoteBump(h || undefined, { alreadyMergedSnapshot });
        }, minGap - elapsed);
        return;
      }
      lastCatchUpAt = now;
      const h = hintMessageId || pendingHint;
      const alreadyMergedSnapshot = Boolean(opts?.alreadyMergedSnapshot || pendingAlreadyMergedSnapshot);
      pendingHint = "";
      pendingAlreadyMergedSnapshot = false;
      void catchUpAfterRemoteBump(h || undefined, { alreadyMergedSnapshot });
    };
    const pendingBumpFrameQueue: Array<{
      payload: Record<string, unknown>;
      hint: string;
      ownDecision: ReturnType<typeof resolveOwnRoomBumpDecision>;
    }> = [];
    const onBump = (payload: Record<string, unknown>) => {
      const known = communityMessengerBumpKnownRoomIds({
        routeRoomId: String(roomId ?? "").trim(),
        streamRoomId: String(streamRoomId ?? "").trim(),
        snapshotRoomId: snapshotRef.current?.room?.id ?? null,
      });
      if (!communityMessengerBumpPayloadMatchesKnownRooms(payload, known)) return;

      const listAction = typeof payload.listAction === "string" ? payload.listAction.trim() : "";
      const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
      if (listAction === "remove" || reason === "group_deleted") {
        const rid =
          (typeof payload.canonicalRoomId === "string" && payload.canonicalRoomId.trim()) ||
          (typeof payload.roomId === "string" && payload.roomId.trim()) ||
          String(streamRoomId ?? roomId ?? "").trim();
        const eventId =
          (typeof payload.eventIdentity === "string" && payload.eventIdentity.trim()) ||
          (typeof payload.messageId === "string" && payload.messageId.trim()) ||
          `group_deleted:${rid}`;
        void import("@/lib/community-messenger/home/group-delete-home-list-eviction").then((mod) => {
          mod.evictDeletedGroupRoomFromHomeLists({ roomId: rid, eventId });
        });
        return;
      }

      /**
       * P2 (Owner 2026-11-18): 메시지 행 영구 삭제(음성) — 레거시와 같이 묘비 없이 그 행을 로컬에서 제거한다.
       * 행이 없으므로 단건 GET(404 재시도)·after= 정합을 하지 않는다. 방 미리보기는 rooms UPDATE 경로가 갱신.
       */
      const messageAction = typeof payload.messageAction === "string" ? payload.messageAction.trim() : "";
      if (messageAction === "hard_deleted") {
        const deletedId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
        if (deletedId) {
          /** 화면 목록 + 방 캐시(메모리·hot) + 진행 중 bootstrap 비행 — 재진입 때 되살아나지 않게 */
          const cacheRoomIds = new Set(
            [
              String(streamRoomId ?? "").trim(),
              String(roomId ?? "").trim(),
              String(snapshotRef.current?.room?.id ?? "").trim(),
            ].filter(Boolean)
          );
          for (const rid of cacheRoomIds) {
            removeMessageFromRoomSnapshotCache({ roomId: rid, viewerUserId: viewer, messageId: deletedId });
            forgetMessengerRoomClientBootstrapFlights({ roomId: rid, viewerUserId: viewer });
            /** F3 (설계 2026-11-18 PR-1): 실시간 저장소 사본도 지운다 — 재진입 병합에서 부활 방지 */
            removeMessengerRealtimeRoomMessage(rid, deletedId);
          }
          setRoomMessages((prev) =>
            prev.some((m) => String(m.id ?? "").trim() === deletedId)
              ? prev.filter((m) => String(m.id ?? "").trim() !== deletedId)
              : prev
          );
        }
        return;
      }

      const from = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
      const rawMessage = payload.message;
      const messageMetadata =
        rawMessage && typeof rawMessage === "object" && rawMessage !== null
          ? (rawMessage as { metadata?: unknown }).metadata
          : null;
      const isStoreOrderSystemBump =
        messageMetadata &&
        typeof messageMetadata === "object" &&
        (messageMetadata as { domain?: unknown }).domain === "store_order";
      const rawSenderId =
        rawMessage && typeof rawMessage === "object" && rawMessage !== null
          ? typeof (rawMessage as { senderId?: unknown }).senderId === "string"
            ? String((rawMessage as { senderId: string }).senderId).trim()
            : ""
          : "";
      const hint =
        typeof payload.messageId === "string"
          ? payload.messageId.trim()
          : typeof (payload as { message_id?: unknown }).message_id === "string"
            ? String((payload as { message_id: string }).message_id).trim()
            : "";
      const rawClientMessageId =
        rawMessage && typeof rawMessage === "object" && rawMessage !== null
          ? typeof (rawMessage as { clientMessageId?: unknown }).clientMessageId === "string"
            ? String((rawMessage as { clientMessageId: string }).clientMessageId).trim()
            : ""
          : "";
      /**
       * Own bumps: THIS device's still-pending optimistic row (same clientMessageId) → replace by validated
       * snapshot only (no extra GET; the send ACK owns reconcile). Confirmed local rows (HTTP rows carry the cid
       * too) → in-place merge so same-account other-device edits/deletes apply.
       * Server-authored rows in viewer's name (call_stub, group system) and other-device sends must apply.
       * Peer-mutated same-id UPDATE (fromUserId !== message.senderId) is never "own" — HTTP reconcile SSOT.
       */
      const ownDecision = resolveOwnRoomBumpDecision({
        viewerUserId: viewer,
        fromUserId: from,
        rawSenderId,
        isStoreOrderSystemBump: Boolean(isStoreOrderSystemBump),
        messageId: hint,
        clientMessageId: rawClientMessageId,
        localMessages: roomMessagesRef.current,
      });

      const dedupeKey = resolveRoomBumpDedupeKey(payload);
      if (lastRemoteBumpDedupeRef.current === dedupeKey) return;
      lastRemoteBumpDedupeRef.current = dedupeKey;

      type FrameItem = {
        payload: Record<string, unknown>;
        hint: string;
        ownDecision: ReturnType<typeof resolveOwnRoomBumpDecision>;
      };
      remoteBumpCatchUpRafRef.current = enqueueRoomBumpFrameItem({
        queue: pendingBumpFrameQueue,
        item: { payload, hint, ownDecision } satisfies FrameItem,
        rafId: remoteBumpCatchUpRafRef.current,
        schedule: (cb) =>
          requestAnimationFrame(() => {
            remoteBumpCatchUpRafRef.current = null;
            cb();
          }),
        flush: (batch) => {
          let catchUpHint = "";
          let mergedAnySnapshot = false;
          let needsCatchUp = false;
          let catchUpAlreadyMerged = false;
          /** L1 ③ — 병합 전 로컬 id 집합(같은 배치 안 중복 id 도 「이미 있음」으로 본다) */
          const localIdsBeforeMerge = new Set(
            roomMessagesRef.current.map((m) => String(m.id ?? "").trim()).filter(Boolean)
          );
          for (const item of batch) {
            /**
             * Snapshot acceleration only when parse validates (message.senderId === fromUserId).
             * Peer-mutated rows fail parse by design — canonical GET reconcile is authority.
             */
            const pre = parseCommunityMessengerBumpMessageSnapshot(item.payload, viewer);
            let mergedSnapshot = false;
            let itemHint = item.hint;
            let existedLocallyBeforeMerge = false;
            let enrichedForSkip: CommunityMessengerMessage | null = null;
            if (pre) {
              const preId = String(pre.id ?? "").trim();
              existedLocallyBeforeMerge = Boolean(preId && localIdsBeforeMerge.has(preId));
              if (preId) localIdsBeforeMerge.add(preId);
              const member = roomMembersDisplayRef.current.find((m) =>
                messengerUserIdsEqual(m.id, pre.senderId ?? "")
              );
              const enriched =
                member?.label && member.label.trim().length > 0
                  ? { ...pre, senderLabel: member.label }
                  : pre;
              enrichedForSkip = enriched;
              setRoomMessages((prev) => mergeRoomMessages(prev, [enriched]));
              const tipRoomId = String(enriched.roomId || streamRoomId || roomId).trim();
              if (tipRoomId) {
                /** P3: 처음 보는 id 만 새 메시지(bump 는 수정에도 발행됨) */
                const firstSeen = !messengerIncomingMessageAlreadyTracked(tipRoomId, String(enriched.id ?? "").trim());
                applyIncomingMessageEvent({
                  viewerUserId: viewer,
                  roomId: tipRoomId,
                  roomSummary: snapshotRef.current?.room ?? undefined,
                  message: enriched,
                  messageEvent: firstSeen ? "insert" : "update",
                  messageRow: {
                    id: enriched.id,
                    room_id: tipRoomId,
                    sender_id: enriched.senderId,
                    message_type: enriched.messageType,
                    content: enriched.content,
                    metadata: enriched.metadata ?? null,
                    created_at: enriched.createdAt,
                    deleted_for_everyone_at: enriched.deletedForEveryoneAt ?? null,
                  },
                });
              }
              itemHint = itemHint || String(pre.id ?? "").trim();
              mergedSnapshot = true;
              mergedAnySnapshot = true;
            }
            /** 서버 직렬화가 본문을 잘랐으면(14k 초과) 스냅샷은 가속일 뿐 — 단건 정합으로 전체 본문을 받는다. */
            const snapshotTruncated = Boolean(
              pre && pre.content.length >= 13_999 && pre.content.endsWith("…")
            );
            /**
             * 이 기기 낙관 행 — 스냅샷으로 pending 교체만, 정합은 송신 ACK 경로가 소유(추가 GET 금지).
             * 내 기기가 이미 가진 확정 행의 제자리 갱신 — 스냅샷을 병합했으면 HTTP catch-up 생략.
             * 스냅샷이 없으면(삭제·수정 등) messages/{id} 단건 정합으로 다른 기기 변경을 반영한다.
             */
            if (item.ownDecision === "replace_pending" && !snapshotTruncated) continue;
            if (item.ownDecision === "merge_only" && mergedSnapshot && !snapshotTruncated) continue;
            /** L1: 상대의 새 텍스트·스티커를 검증된 스냅샷으로 병합했으면 단건 GET 생략(조건은 정책 함수) */
            if (
              item.ownDecision === "apply" &&
              mergedSnapshot &&
              shouldSkipPeerBumpSingleGet({
                snapshot: enrichedForSkip,
                snapshotTruncated,
                existedLocallyBeforeMerge,
              })
            ) {
              continue;
            }
            needsCatchUp = true;
            if (itemHint) catchUpHint = itemHint;
            if (mergedSnapshot && !snapshotTruncated) catchUpAlreadyMerged = true;
          }
          if (needsCatchUp) {
            scheduleCatchUp(catchUpHint, {
              alreadyMergedSnapshot: catchUpAlreadyMerged || mergedAnySnapshot,
            });
          }
        },
      });
    };
    listenerRef.current.onBump = onBump;
    /** 재가입 공백 보상 — 스냅샷 병합 없이 `after=` 만(새 행 없으면 refresh 로 넘어가지 않게 alreadyMergedSnapshot) */
    listenerRef.current.onResync = () => scheduleCatchUp("", { alreadyMergedSnapshot: true });
    const registryKey = `${viewer}:${[...bumpSubscribeIds].sort().join("\0")}`;
    let entry = roomBumpEntries.get(registryKey);
    if (!entry) {
      entry = createRoomBumpEntry(registryKey, [...bumpSubscribeIds]);
      roomBumpEntries.set(registryKey, entry);
    }
    entry.listeners.add(listenerRef);

    return () => {
      lastRemoteBumpDedupeRef.current = "";
      pendingBumpFrameQueue.length = 0;
      if (remoteBumpCatchUpRafRef.current != null) {
        cancelAnimationFrame(remoteBumpCatchUpRafRef.current);
        remoteBumpCatchUpRafRef.current = null;
      }
      if (catchUpTimer != null) {
        clearTimeout(catchUpTimer);
        catchUpTimer = null;
      }
      const current = roomBumpEntries.get(registryKey);
      if (!current) return;
      current.listeners.delete(listenerRef);
      if (current.listeners.size === 0) current.stop();
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
