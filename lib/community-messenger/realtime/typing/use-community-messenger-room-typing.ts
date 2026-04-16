"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";

const TYPING_IDLE_MS = 2600;
const TYPING_TTL_MS = 3200;

export function useCommunityMessengerRoomTypingRuntime(args: {
  roomId: string | null | undefined;
  viewerUserId: string | null | undefined;
  peerUserId: string | null | undefined;
}): void {
  const stopTimerRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>["channel"]> | null>(null);

  useEffect(() => {
    const roomId = typeof args.roomId === "string" ? args.roomId.trim() : "";
    const viewerUserId = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
    const peerUserId = typeof args.peerUserId === "string" ? args.peerUserId.trim() : "";
    if (!roomId || !viewerUserId || !peerUserId) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    const typingStore = useMessengerTypingStore;
    const channel = sb
      .channel(`community-messenger-typing:${roomId}`, { config: { broadcast: { ack: false } } })
      .on("broadcast", { event: "typing:start" }, (msg) => {
        const payload = (msg as { payload?: Record<string, unknown> }).payload ?? {};
        const fromUserId = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
        if (fromUserId !== peerUserId) return;
        typingStore.getState().setTyping(roomId, fromUserId, TYPING_TTL_MS);
      })
      .on("broadcast", { event: "typing:stop" }, (msg) => {
        const payload = (msg as { payload?: Record<string, unknown> }).payload ?? {};
        const fromUserId = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
        if (fromUserId !== peerUserId) return;
        typingStore.getState().clearTyping(roomId, fromUserId);
      })
      .subscribe();
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
      typingStore.getState().clearTyping(roomId, peerUserId);
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
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>["channel"]> | null>(null);

  useEffect(() => {
    const roomId = typeof args.roomId === "string" ? args.roomId.trim() : "";
    const viewerUserId = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
    if (!roomId || !viewerUserId) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb.channel(`community-messenger-typing:${roomId}`, { config: { broadcast: { ack: false } } }).subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void sb.removeChannel(channel);
    };
  }, [args.roomId, args.viewerUserId]);

  useEffect(() => {
    const roomId = typeof args.roomId === "string" ? args.roomId.trim() : "";
    const viewerUserId = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
    const channel = channelRef.current;
    if (!roomId || !viewerUserId || !channel) return;
    const send = (event: "typing:start" | "typing:stop") =>
      channel.send({
        type: "broadcast",
        event,
        payload: {
          roomId,
          fromUserId: viewerUserId,
          at: new Date().toISOString(),
        },
      });

    const hasDraft = args.draft.trim().length > 0;
    if (hasDraft) {
      if (lastStateRef.current !== "typing") {
        lastStateRef.current = "typing";
        void send("typing:start");
      }
      if (stopTimerRef.current != null) window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = window.setTimeout(() => {
        lastStateRef.current = "idle";
        void send("typing:stop");
      }, TYPING_IDLE_MS);
      return;
    }

    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (lastStateRef.current === "typing") {
      lastStateRef.current = "idle";
      void send("typing:stop");
    }
  }, [args.draft, args.roomId, args.viewerUserId]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current != null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (channelRef.current && lastStateRef.current === "typing") {
        void channelRef.current.send({
          type: "broadcast",
          event: "typing:stop",
          payload: {
            roomId: typeof args.roomId === "string" ? args.roomId.trim() : "",
            fromUserId: typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "",
            at: new Date().toISOString(),
          },
        });
      }
      lastStateRef.current = "idle";
    };
  }, [args.roomId, args.viewerUserId]);
}
