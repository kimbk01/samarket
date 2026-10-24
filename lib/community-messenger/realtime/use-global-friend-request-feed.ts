"use client";

/**
 * 전역 친구 요청 피드 — 메신저 홈이 아닌 탭(마켓·필라이프·채팅방 등)에서도 중앙 팝업을 띄운다.
 * 1단계 문서 §3-2 ③ · F-6.
 *
 * - 마운트·로그인 시 대기 중 요청 1회 조회 → 팝업 큐 적재(앱이 꺼져 있던 동안 온 요청 포함)
 * - `community_friend_requests` Realtime (addressee = 나) → pending 이면 재조회·적재, 아니면 큐에서 제거
 * - (requester = 나) INSERT/UPDATE pending → 상대 이름 기억 · UPDATE accepted → 「○○님이 친구 요청을 수락했습니다」 콜백
 * 메신저 홈 채널의 같은 테이블 구독과 채널 이름이 달라 충돌하지 않는다.
 */
import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";

type FriendRequestRowPayload = { id?: unknown; status?: unknown };

function rowOf(payload: unknown): { id: string; status: string } | null {
  const row = (payload as { new?: FriendRequestRowPayload } | null)?.new;
  const id = typeof row?.id === "string" ? row.id.trim() : "";
  const status = typeof row?.status === "string" ? row.status.trim() : "";
  return id ? { id, status } : null;
}

async function fetchPendingFriendRequests(): Promise<CommunityMessengerFriendRequest[] | null> {
  try {
    const res = await fetch("/api/community-messenger/friend-requests", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { ok?: boolean; requests?: CommunityMessengerFriendRequest[] } | null;
    return json?.ok && Array.isArray(json.requests) ? json.requests : null;
  } catch {
    return null;
  }
}

export function useGlobalFriendRequestFeed(args: {
  enabled: boolean;
  onAcceptedByPeer: (peerLabel: string) => void;
}): void {
  const onAcceptedRef = useRef(args.onAcceptedByPeer);
  onAcceptedRef.current = args.onAcceptedByPeer;

  useEffect(() => {
    if (!args.enabled) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let subscribedUserId = "";
    /** 보낸 요청 id → 상대 이름 (수락 안내 문구용) */
    const outgoingLabelById = new Map<string, string>();
    let inflight: Promise<void> | null = null;
    let rerun = false;

    const syncPending = (): Promise<void> => {
      if (inflight) {
        rerun = true;
        return inflight;
      }
      inflight = (async () => {
        do {
          rerun = false;
          const requests = await fetchPendingFriendRequests();
          if (cancelled || !requests) continue;
          const store = useIncomingFriendRequestPopupStore.getState();
          const incoming = requests.filter((r) => r.status === "pending" && r.direction === "incoming");
          const pendingIds = new Set(incoming.map((r) => r.id));
          for (const shown of store.friendRequestList) {
            if (!pendingIds.has(shown.id)) store.removeFriendRequestIfId(shown.id);
          }
          for (const req of incoming) {
            store.upsertFriendRequest({
              id: req.id,
              requesterId: req.requesterId,
              requesterLabel: req.requesterLabel || req.requesterId,
              requesterAvatarUrl: req.requesterAvatarUrl ?? null,
              requesterHandle: req.requesterHandle ?? null,
              createdAt: req.createdAt,
            });
          }
          for (const req of requests) {
            if (req.status === "pending" && req.direction === "outgoing" && req.addresseeLabel) {
              outgoingLabelById.set(req.id, req.addresseeLabel);
            }
          }
        } while (rerun && !cancelled);
      })().finally(() => {
        inflight = null;
      });
      return inflight;
    };

    const stop = () => {
      if (channel) {
        try {
          void sb.removeChannel(channel);
        } catch {
          /* ignore */
        }
      }
      channel = null;
      subscribedUserId = "";
    };

    const subscribeForUser = (uid: string) => {
      if (cancelled || !uid || uid === subscribedUserId) return;
      stop();
      subscribedUserId = uid;
      void syncPending();
      channel = sb
        .channel(`cm-friend-requests-global:${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "community_friend_requests", filter: `addressee_id=eq.${uid}` },
          (payload) => {
            if (cancelled) return;
            const row = rowOf(payload);
            if (row && row.status && row.status !== "pending") {
              useIncomingFriendRequestPopupStore.getState().removeFriendRequestIfId(row.id);
              return;
            }
            void syncPending();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "community_friend_requests", filter: `requester_id=eq.${uid}` },
          (payload) => {
            if (cancelled) return;
            const row = rowOf(payload);
            if (!row) return;
            if (row.status === "accepted") {
              const label = outgoingLabelById.get(row.id) ?? "";
              outgoingLabelById.delete(row.id);
              onAcceptedRef.current(label);
              return;
            }
            if (row.status === "pending") void syncPending();
          }
        )
        .subscribe();
    };

    void sb.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id?.trim();
      if (uid) subscribeForUser(uid);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        stop();
        useIncomingFriendRequestPopupStore.getState().dismissAllFriendRequests();
        return;
      }
      const uid = session?.user?.id?.trim();
      if (uid && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) subscribeForUser(uid);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      stop();
    };
  }, [args.enabled]);
}
