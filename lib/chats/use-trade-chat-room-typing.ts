"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { waitForSupabaseRealtimeAuth } from "@/lib/supabase/wait-for-realtime-auth";
import { TRADE_TYPING_TTL_MS } from "@/lib/chats/trade-presence-policy";

const TYPING_IDLE_MS = 3000;
const EVENT_START = "typing:start";
const EVENT_STOP = "typing:stop";

function typingChannel(roomId: string) {
  return `trade-chat-typing:${roomId.trim()}`;
}

export function useTradeChatRoomTypingPeer(args: {
  roomId: string | null | undefined;
  viewerUserId: string | null | undefined;
  partnerUserId: string | null | undefined;
  enabled: boolean;
  /** 상대가 live 를 공유하지 않으면 타이핑 표시도 받지 않음 */
  receiveTyping: boolean;
  bootstrapReady?: boolean;
}): boolean {
  const [typing, setTyping] = useState(false);
  const untilRef = useRef(0);

  useEffect(() => {
    const roomId = typeof args.roomId === "string" ? args.roomId.trim() : "";
    const viewer = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
    const partner = typeof args.partnerUserId === "string" ? args.partnerUserId.trim() : "";
    const ready = args.bootstrapReady !== false;
    if (!roomId || !viewer || !partner || !args.enabled || !args.receiveTyping || !ready) {
      setTyping(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    let ch: RealtimeChannel | null = null;

    const touch = () => {
      untilRef.current = Date.now() + TRADE_TYPING_TTL_MS;
      setTyping(true);
    };
    const clear = () => {
      untilRef.current = 0;
      setTyping(false);
    };

    void (async () => {
      const authOk = await waitForSupabaseRealtimeAuth(sb);
      if (cancelled || !authOk) return;
      const channel = sb
        .channel(typingChannel(roomId), { config: { broadcast: { ack: false } } })
        .on("broadcast", { event: EVENT_START }, (msg) => {
          const p = (msg as { payload?: Record<string, unknown> }).payload ?? {};
          const from = typeof p.fromUserId === "string" ? p.fromUserId.trim() : "";
          if (!from || from === viewer || from !== partner) return;
          touch();
        })
        .on("broadcast", { event: EVENT_STOP }, (msg) => {
          const p = (msg as { payload?: Record<string, unknown> }).payload ?? {};
          const from = typeof p.fromUserId === "string" ? p.fromUserId.trim() : "";
          if (!from || from === viewer || from !== partner) return;
          clear();
        })
        .subscribe();
      ch = channel;
    })();

    const prune = window.setInterval(() => {
      if (untilRef.current > 0 && Date.now() > untilRef.current) clear();
    }, 400);

    return () => {
      cancelled = true;
      window.clearInterval(prune);
      if (ch) void sb.removeChannel(ch);
      setTyping(false);
    };
  }, [args.bootstrapReady, args.enabled, args.receiveTyping, args.partnerUserId, args.roomId, args.viewerUserId]);

  return typing;
}

export function useTradeChatRoomTypingPublisher(args: {
  roomId: string | null | undefined;
  viewerUserId: string | null | undefined;
  draft: string;
  enabled: boolean;
  /** presence 송신과 동일 — 나만 보기 등이면 타이핑도 송신 안 함 */
  publishTyping: boolean;
  bootstrapReady?: boolean;
}): void {
  const lastStateRef = useRef<"idle" | "typing">("idle");
  const stopTimerRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [channelReady, setChannelReady] = useState(false);
  const publishTypingRef = useRef(args.publishTyping);
  publishTypingRef.current = args.publishTyping;

  useEffect(() => {
    const roomId = typeof args.roomId === "string" ? args.roomId.trim() : "";
    const viewer = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
    const ready = args.bootstrapReady !== false;
    setChannelReady(false);
    if (!roomId || !viewer || !args.enabled || !ready) {
      channelRef.current = null;
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    let ch: RealtimeChannel | null = null;

    void (async () => {
      const authOk = await waitForSupabaseRealtimeAuth(sb);
      if (cancelled || !authOk) return;
      const channel = sb.channel(typingChannel(roomId), { config: { broadcast: { ack: false } } }).subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          setChannelReady(true);
        }
      });
      ch = channel;
    })();

    return () => {
      cancelled = true;
      setChannelReady(false);
      channelRef.current = null;
      if (ch) void sb.removeChannel(ch);
    };
  }, [args.bootstrapReady, args.enabled, args.roomId, args.viewerUserId]);

  useEffect(() => {
    const roomId = typeof args.roomId === "string" ? args.roomId.trim() : "";
    const viewer = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
    const channel = channelRef.current;
    if (!channelReady || !roomId || !viewer || !channel) return;

    const send = (event: typeof EVENT_START | typeof EVENT_STOP) =>
      void channel.send({
        type: "broadcast",
        event,
        payload: { roomId, fromUserId: viewer, at: new Date().toISOString() },
      });

    if (!publishTypingRef.current) {
      if (stopTimerRef.current != null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (lastStateRef.current === "typing") {
        lastStateRef.current = "idle";
        send(EVENT_STOP);
      }
      return;
    }

    const hasDraft = args.draft.trim().length > 0;
    if (hasDraft) {
      if (lastStateRef.current !== "typing") {
        lastStateRef.current = "typing";
        send(EVENT_START);
      }
      if (stopTimerRef.current != null) window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = window.setTimeout(() => {
        lastStateRef.current = "idle";
        send(EVENT_STOP);
      }, TYPING_IDLE_MS);
      return;
    }

    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (lastStateRef.current === "typing") {
      lastStateRef.current = "idle";
      send(EVENT_STOP);
    }
  }, [args.draft, channelReady, args.roomId, args.viewerUserId]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current != null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      const ch = channelRef.current;
      if (ch && lastStateRef.current === "typing") {
        void ch.send({
          type: "broadcast",
          event: EVENT_STOP,
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
