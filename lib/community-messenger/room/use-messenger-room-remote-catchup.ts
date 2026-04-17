"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

export type MessengerRoomBootstrapRefresh = (silent?: boolean) => Promise<void>;

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
  catchUpAfterRemoteBump: (hintMessageId?: string | null) => Promise<void>;
} {
  const catchUpNewerMessages = useCallback(async (): Promise<boolean> => {
    const id = (snapshotRef.current?.room?.id?.trim() || roomId?.trim() || "").trim();
    if (!id) return false;
    const confirmed = roomMessagesRef.current.filter((m) => !m.pending);
    if (confirmed.length === 0) {
      // 첫 진입/희귀 레이스: 아직 confirmed가 없으면 부트스트랩 refresh로 최신 윈도를 먼저 확보.
      void refresh(true);
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
      void refresh(true);
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
      setRoomMessages((prev) => mergeRoomMessages(prev, json.messages ?? []));
      return true;
    } catch {
      /* ignore */
    }
    return false;
  }, [roomId, streamRoomId, refresh]);

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
    async (hintMessageId?: string | null) => {
      const hint = typeof hintMessageId === "string" ? hintMessageId.trim() : "";
      if (hint && (await tryMergeSingleMessageFromBump(hint))) {
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
      void refresh(true);
    },
    [catchUpNewerMessages, refresh, tryMergeSingleMessageFromBump]
  );

  return { catchUpNewerMessages, catchUpAfterRemoteBump };
}
