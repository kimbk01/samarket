"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";
import {
  createMessengerPrivateChannelStatusHandler,
  messengerPrivateBroadcastChannelOptions,
  primeMessengerPrivateRealtimeAuth,
  sendMessengerPrivateBroadcastFromClient,
} from "@/lib/community-messenger/realtime/private-broadcast-client";

/**
 * 타이핑 — 방 단위 **비공개** 토픽 `community-messenger-typing:<roomId>`.
 * 수신: private 채널 join(SELECT 정책 = 방 접근 가능자). 발신: REST broadcast + 사용자 JWT(INSERT 정책).
 * 발신 쪽이 같은 토픽 채널을 따로 만들지 않으므로 removeChannel 이 수신 채널을 끊는 공유 인스턴스 충돌이 없다.
 */
export function communityMessengerTypingChannelName(roomId: string): string {
  return `community-messenger-typing:${String(roomId ?? "").trim().toLowerCase()}`;
}

const TYPING_IDLE_MS = 2600;
const TYPING_TTL_MS = 3200;

export function useCommunityMessengerRoomTypingRuntime(args: {
  roomId: string | null | undefined;
  viewerUserId: string | null | undefined;
  /** 1:1 일 때만 상대 id. 그룹·오픈은 빈 값 — 다른 참가자 전원의 타이핑을 받는다. */
  peerUserId: string | null | undefined;
}): void {
  const stopTimerRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>["channel"]> | null>(null);

  useEffect(() => {
    const roomId = typeof args.roomId === "string" ? args.roomId.trim().toLowerCase() : "";
    const viewerUserId = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
    const peerUserId = typeof args.peerUserId === "string" ? args.peerUserId.trim() : "";
    if (!roomId || !viewerUserId) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    const typingStore = useMessengerTypingStore;
    primeMessengerPrivateRealtimeAuth(sb);
    const channel = sb
      .channel(communityMessengerTypingChannelName(roomId), messengerPrivateBroadcastChannelOptions())
      .on("broadcast", { event: "typing:start" }, (msg) => {
        const payload = (msg as { payload?: Record<string, unknown> }).payload ?? {};
        const fromUserId = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
        if (!fromUserId || fromUserId === viewerUserId) return;
        if (peerUserId && fromUserId !== peerUserId) return;
        typingStore.getState().setTyping(roomId, fromUserId, TYPING_TTL_MS);
      })
      .on("broadcast", { event: "typing:stop" }, (msg) => {
        const payload = (msg as { payload?: Record<string, unknown> }).payload ?? {};
        const fromUserId = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
        if (!fromUserId || fromUserId === viewerUserId) return;
        if (peerUserId && fromUserId !== peerUserId) return;
        typingStore.getState().clearTyping(roomId, fromUserId);
      })
      .subscribe(createMessengerPrivateChannelStatusHandler({ sb, scope: "typing" }));
    channelRef.current = channel;
    const pruneTimer = window.setInterval(() => {
      typingStore.getState().clearExpired();
    }, 1500);
    return () => {
      if (stopTimerRef.current != null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      window.clearInterval(pruneTimer);
      channelRef.current = null;
      void sb.removeChannel(channel);
      const bucket = typingStore.getState().byRoomId[roomId];
      if (bucket) {
        for (const uid of Object.keys(bucket)) {
          typingStore.getState().clearTyping(roomId, uid);
        }
      }
    };
  }, [args.peerUserId, args.roomId, args.viewerUserId]);
}

export function useCommunityMessengerRoomTypingPublisher(args: {
  roomId: string | null | undefined;
  viewerUserId: string | null | undefined;
  draft: string;
}): void {
  const lastStateRef = useRef<"idle" | "typing">("idle");
  const stopTimerRef = useRef<number | null>(null);

  const sendTyping = (roomIdRaw: string | null | undefined, viewerRaw: string | null | undefined, event: "typing:start" | "typing:stop") => {
    const roomId = typeof roomIdRaw === "string" ? roomIdRaw.trim().toLowerCase() : "";
    const viewerUserId = typeof viewerRaw === "string" ? viewerRaw.trim() : "";
    if (!roomId || !viewerUserId) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    void sendMessengerPrivateBroadcastFromClient({
      sb,
      topic: communityMessengerTypingChannelName(roomId),
      event,
      payload: { roomId, fromUserId: viewerUserId, at: new Date().toISOString() },
      scope: "typing",
      timeoutMs: 3_000,
    });
  };

  useEffect(() => {
    const roomId = typeof args.roomId === "string" ? args.roomId.trim().toLowerCase() : "";
    const viewerUserId = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
    if (!roomId || !viewerUserId) return;

    const hasDraft = args.draft.trim().length > 0;
    if (hasDraft) {
      if (lastStateRef.current !== "typing") {
        lastStateRef.current = "typing";
        sendTyping(roomId, viewerUserId, "typing:start");
      }
      if (stopTimerRef.current != null) window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = window.setTimeout(() => {
        lastStateRef.current = "idle";
        sendTyping(roomId, viewerUserId, "typing:stop");
      }, TYPING_IDLE_MS);
      return;
    }

    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (lastStateRef.current === "typing") {
      lastStateRef.current = "idle";
      sendTyping(roomId, viewerUserId, "typing:stop");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sendTyping is stateless (reads client per call)
  }, [args.draft, args.roomId, args.viewerUserId]);

  useEffect(() => {
    const roomId = args.roomId;
    const viewerUserId = args.viewerUserId;
    return () => {
      if (stopTimerRef.current != null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (lastStateRef.current === "typing") {
        sendTyping(roomId, viewerUserId, "typing:stop");
      }
      lastStateRef.current = "idle";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup per room/viewer
  }, [args.roomId, args.viewerUserId]);
}
