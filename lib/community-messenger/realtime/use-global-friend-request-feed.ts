"use client";

/**
 * 전역 친구 요청 피드 — 메신저 홈이 아닌 탭(마켓·필라이프·채팅방 등)에서도 중앙 팝업을 띄운다.
 * 1단계 문서 §3-2 ③ · F-6.
 *
 * - 마운트·로그인 시 대기 중 요청 1회 조회 → 팝업 큐 적재(앱이 꺼져 있던 동안 온 요청 포함)
 * - `community_friend_requests` Realtime (addressee = 나) → pending 이면 재조회·적재, 아니면 큐에서 제거
 * - (requester = 나) INSERT/UPDATE pending → 상대 이름 기억 · UPDATE accepted → 「○○님이 친구 요청을 수락했습니다」 콜백
 * - 앱 복귀·실시간 채널 (재)연결 시 다시 조회 — 백그라운드 동안 놓친 INSERT 는 Realtime 이 재전송하지
 *   않는다(2026-10-25 실기기: iPhone 백그라운드 중 도착한 요청이 복귀 후 팝업 미표시, 콜드 스타트 시에만 표시).
 *   네이티브 앱은 WKWebView 가 앱 복귀 때 visibilitychange 를 보내지 않아(같은 날 재시험에서 재현) Capacitor
 *   `appStateChange(isActive)` 로 감지한다 — 통화·배지·로그인 복귀와 같은 방식. 웹은 visibilitychange·focus.
 * 구독은 공용 `subscribeWithRetry` — 구독 전 로그인 토큰을 Realtime 에 맞추고(`postgres_changes` 는 RLS 로 본인 행만
 * 전달) 실패 시 재시도한다. 직접 `sb.channel().subscribe()` 하면 토큰 없이 붙어 이벤트가 오지 않았다
 * (2026-10-25 14:57 실기기: 홈 채널은 이벤트 수신, 피드 채널은 미수신 → iPhone 팝업 없음).
 * 메신저 홈 채널의 같은 테이블 구독과 채널 이름이 달라 충돌하지 않는다.
 */
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";

type FriendRequestRowPayload = { id?: unknown; status?: unknown };

/**
 * 서버에서 받은 대기 친구 요청 전체(받은+보낸) — 홈 화면이 이 목록으로 요청 상태를 교체한다.
 * 홈이 세션 캐시만으로 복원되면 서버를 다시 묻지 않아 취소·처리된 요청이 남았다(2026-10-25 D-12).
 */
export const CM_FRIEND_REQUESTS_SYNCED_EVENT = "cm:friend-requests-synced";
export type CmFriendRequestsSyncedDetail = { viewerUserId: string; requests: CommunityMessengerFriendRequest[] };
/** 홈이 열릴 때 피드에 즉시 재조회를 요청 — 피드의 앞선 결과를 놓치지 않게 */
export const CM_FRIEND_REQUESTS_SYNC_REQUEST_EVENT = "cm:friend-requests-sync-request";

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
    let channel: { stop: () => void } | null = null;
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
          if (typeof window !== "undefined" && subscribedUserId) {
            window.dispatchEvent(
              new CustomEvent<CmFriendRequestsSyncedDetail>(CM_FRIEND_REQUESTS_SYNCED_EVENT, {
                detail: { viewerUserId: subscribedUserId, requests },
              })
            );
          }
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
      channel?.stop();
      channel = null;
      subscribedUserId = "";
    };

    const subscribeForUser = (uid: string) => {
      if (cancelled || !uid || uid === subscribedUserId) return;
      stop();
      subscribedUserId = uid;
      /**
       * 시작 즉시 1회 조회 — 실시간 채널 SUBSCRIBED 를 기다리면 채널이 연결되지 않는 환경(2026-10-25 iPhone,
       * 커뮤니티 화면 콜드 스타트)에서 팝업이 영영 안 뜬다. SUBSCRIBED·앱 복귀 재조회는 추가로 둔다.
       */
      void syncPending();
      channel = subscribeWithRetry({
        sb,
        name: `cm-friend-requests-global:${uid}`,
        scope: "cm-friend-requests-global",
        isCancelled: () => cancelled || subscribedUserId !== uid,
        onStatus: (status) => {
          /** 최초 연결·재연결 모두 — 연결이 끊긴 동안의 변경을 목록 조회로 맞춘다. */
          if (status === "SUBSCRIBED" && !cancelled) void syncPending();
        },
        build: (ch) =>
          ch
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "community_friend_requests", filter: `addressee_id=eq.${uid}` },
              (payload) => {
                if (cancelled) return;
                const row = rowOf(payload);
                if (row && row.status && row.status !== "pending") {
                  useIncomingFriendRequestPopupStore.getState().removeFriendRequestIfId(row.id);
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
                if (row?.status === "accepted") {
                  const label = outgoingLabelById.get(row.id) ?? "";
                  outgoingLabelById.delete(row.id);
                  onAcceptedRef.current(label);
                }
                void syncPending();
              }
            ),
      });
    };

    const onVisible = () => {
      if (cancelled || !subscribedUserId) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void syncPending();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const onSyncRequest = () => {
      if (cancelled || !subscribedUserId) return;
      void syncPending();
    };
    window.addEventListener(CM_FRIEND_REQUESTS_SYNC_REQUEST_EVENT, onSyncRequest);
    let appStateHandle: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app")
        .then(({ App }) =>
          App.addListener("appStateChange", ({ isActive }) => {
            if (!isActive || cancelled || !subscribedUserId) return;
            void syncPending();
          })
        )
        .then((handle) => {
          if (cancelled) handle.remove();
          else appStateHandle = handle;
        })
        .catch(() => {
          /* 웹 이벤트 경로만 남는다 */
        });
    }

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
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(CM_FRIEND_REQUESTS_SYNC_REQUEST_EVENT, onSyncRequest);
      appStateHandle?.remove();
      subscription.unsubscribe();
      stop();
    };
  }, [args.enabled]);
}
