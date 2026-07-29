"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { applyIncomingMessageEvent } from "@/lib/community-messenger/stores/messenger-realtime-store";

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
  catchUpNewerMessages: () => Promise<boolean>;
  catchUpAfterRemoteBump: (
    hintMessageId?: string | null,
    opts?: { alreadyMergedSnapshot?: boolean }
  ) => Promise<void>;
} {
  const catchUpNewerMessages = useCallback(async (): Promise<boolean> => {
    const id = (snapshotRef.current?.room?.id?.trim() || roomId?.trim() || "").trim();
    if (!id) return false;
    const confirmed = roomMessagesRef.current.filter((m) => !m.pending);
    if (confirmed.length === 0) {
      return false;
    }
    /** 앵커는 배열 끝이 아니라 **시간상 최신 확정 메시지** — 정렬/가상화와 무관하게 `after=` 일관 */
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
      const incoming = json.messages ?? [];
      setRoomMessages((prev) => mergeRoomMessages(prev, incoming));
      const viewer = snapshotRef.current?.viewerUserId?.trim() || null;
      const roomSummary = snapshotRef.current?.room ?? null;
      for (const row of incoming) {
        projectHubTipAfterCatchUpMerge({
          viewerUserId: viewer,
          roomId: id,
          message: row,
          roomSummary,
        });
      }
      return true;
    } catch {
      /* ignore */
    }
    return false;
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

  /** 원격 bump 직후: 단건 병합 → 실패 시 `after` 증분 → 마지막에 스냅샷 refresh */
  const catchUpAfterRemoteBump = useCallback(
    async (hintMessageId?: string | null, opts?: { alreadyMergedSnapshot?: boolean }) => {
      const hint = typeof hintMessageId === "string" ? hintMessageId.trim() : "";
      const mergedBySnapshot = Boolean(opts?.alreadyMergedSnapshot && hint);
      if (mergedBySnapshot) {
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
      if (hint && (await tryMergeSingleMessageFromBump(hint))) {
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

  return { catchUpNewerMessages, catchUpAfterRemoteBump };
}
