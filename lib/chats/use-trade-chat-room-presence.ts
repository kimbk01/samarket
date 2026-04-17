"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { waitForSupabaseRealtimeAuth } from "@/lib/supabase/wait-for-realtime-auth";
import {
  computeTradePresenceLiveState,
  type TradePresenceLiveState,
} from "@/lib/chats/trade-presence-policy";

const PEER_PING_TTL_MS = 45_000;
const PRESENCE_EVENT = "presence:ping";
const PUBLISH_INTERVAL_MS = 12_000;

type PingPayload = {
  fromUserId?: string;
  lastActivityAtMs?: number;
  tabVisible?: boolean;
  at?: string;
};

function channelName(roomId: string) {
  return `trade-chat-presence:${roomId.trim()}`;
}

export function useTradeChatRoomPresence(args: {
  roomId: string | null | undefined;
  viewerUserId: string | null | undefined;
  partnerUserId: string | null | undefined;
  enabled: boolean;
  /** 상대가 온라인 표시를 공유할 때만 브로드캐스트 반영 */
  readPeerLive: boolean;
  publishLive: boolean;
  getLastActivityAtMs: () => number;
  aggregatedTabVisible: boolean;
  bootstrapReady?: boolean;
}): { peerLiveState: TradePresenceLiveState; channelLive: boolean } {
  const [peerLiveState, setPeerLiveState] = useState<TradePresenceLiveState>("offline");
  const [channelLive, setChannelLive] = useState(false);
  const peerRef = useRef<{ lastActivityAtMs: number; tabVisible: boolean; receivedAtMs: number } | null>(null);
  const getLastRef = useRef(args.getLastActivityAtMs);
  const tabVisRef = useRef(args.aggregatedTabVisible);
  const publishLiveRef = useRef(args.publishLive);
  const readPeerLiveRef = useRef(args.readPeerLive);
  getLastRef.current = args.getLastActivityAtMs;
  tabVisRef.current = args.aggregatedTabVisible;
  publishLiveRef.current = args.publishLive;
  readPeerLiveRef.current = args.readPeerLive;

  const recompute = useCallback(() => {
    const p = peerRef.current;
    const now = Date.now();
    if (!p || now - p.receivedAtMs > PEER_PING_TTL_MS) {
      setPeerLiveState("offline");
      return;
    }
    setPeerLiveState(
      computeTradePresenceLiveState({
        wsLive: true,
        tabVisible: p.tabVisible,
        lastActivityAtMs: p.lastActivityAtMs,
        nowMs: now,
      })
    );
  }, []);

  useEffect(() => {
    const roomId = typeof args.roomId === "string" ? args.roomId.trim() : "";
    const viewer = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
    const partner = typeof args.partnerUserId === "string" ? args.partnerUserId.trim() : "";
    const ready = args.bootstrapReady !== false;
    if (!roomId || !viewer || !partner || !args.enabled || !ready) {
      peerRef.current = null;
      setPeerLiveState("offline");
      setChannelLive(false);
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      setChannelLive(false);
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let publishTimer: number | null = null;
    let tickTimer: number | null = null;

    const applyPing = (payload: PingPayload) => {
      if (!readPeerLiveRef.current) return;
      const from = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
      if (!from || from === viewer || from !== partner) return;
      const lastActivityAtMs = Number(payload.lastActivityAtMs);
      const tabVisible = payload.tabVisible === true;
      if (!Number.isFinite(lastActivityAtMs)) return;
      peerRef.current = { lastActivityAtMs, tabVisible, receivedAtMs: Date.now() };
      recompute();
    };

    void (async () => {
      const authOk = await waitForSupabaseRealtimeAuth(sb);
      if (cancelled || !authOk) return;

      const ch = sb
        .channel(channelName(roomId), { config: { broadcast: { ack: false } } })
        .on("broadcast", { event: PRESENCE_EVENT }, (msg) => {
          const payload = (msg as { payload?: PingPayload }).payload ?? {};
          applyPing(payload);
        })
        .subscribe((status) => {
          if (cancelled) return;
          const live = status === "SUBSCRIBED";
          setChannelLive(live);
        });

      channel = ch;

      const publish = () => {
        if (cancelled || !publishLiveRef.current) return;
        void ch.send({
          type: "broadcast",
          event: PRESENCE_EVENT,
          payload: {
            fromUserId: viewer,
            lastActivityAtMs: getLastRef.current(),
            tabVisible: tabVisRef.current,
            at: new Date().toISOString(),
          },
        });
      };
      publish();
      publishTimer = window.setInterval(publish, PUBLISH_INTERVAL_MS);
      tickTimer = window.setInterval(() => recompute(), 2000);
    })();

    return () => {
      cancelled = true;
      if (publishTimer != null) window.clearInterval(publishTimer);
      if (tickTimer != null) window.clearInterval(tickTimer);
      peerRef.current = null;
      setChannelLive(false);
      setPeerLiveState("offline");
      if (channel) void sb.removeChannel(channel);
    };
  }, [
    args.bootstrapReady,
    args.enabled,
    args.partnerUserId,
    args.roomId,
    args.viewerUserId,
    recompute,
  ]);

  useEffect(() => {
    if (args.readPeerLive) return;
    peerRef.current = null;
    setPeerLiveState("offline");
  }, [args.readPeerLive]);

  return { peerLiveState, channelLive };
}
