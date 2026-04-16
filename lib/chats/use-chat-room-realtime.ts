"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ChatMessage } from "@/lib/types/chat";
import { getSupabaseClient } from "@/lib/supabase/client";
import { waitForSupabaseRealtimeAuth } from "@/lib/supabase/wait-for-realtime-auth";
import { integratedChatRowToMessage } from "@/lib/chats/fetch-chat-room-messages-api";
import { mapProductChatMessageRow } from "@/lib/chats/map-product-chat-message-row";
import { groupMessageRowToChatMessage } from "@/lib/group-chat/map-group-message-row";

export type ChatRealtimeMode = "integrated" | "legacy" | "group";

/** 방 단위 Realtime 진단 · UI 스트립용 */
export type ChatRoomRealtimeConnectionState =
  | "disabled"
  | "connecting"
  | "reconnecting"
  | "live"
  | "fallback";

/** 끊김 후 재연결 백오프 — 실서비스 체감 우선(과도한 재시도는 max 로 제한) */
const RETRY_BASE_MS = 380;
const RETRY_MAX_MS = 22_000;

/**
 * Supabase Realtime `postgres_changes` — 방 단위 구독 + 끊김 시 백오프 재연결 + 포그라운드 시 재시도.
 *
 * **운영**: `Database → Replication` 에 `chat_messages`, `product_chat_messages` publication.
 * RLS로 SELECT 허용 행만 전달. 세션은 `getSupabaseClient()` 기준.
 */
export function useChatRoomRealtime(args: {
  roomId: string | null;
  mode: ChatRealtimeMode;
  enabled: boolean;
  /** false: 방 부트스트랩·초기 데이터 준비 전 — 구독하지 않음 */
  bootstrapReady?: boolean;
  onMessage: (msg: ChatMessage) => void;
  onMessageRemoved?: (messageId: string) => void;
  includeHiddenMessages?: boolean;
  hiddenReasonPrefix?: string;
  /** SUBSCRIBED 여부 (폴링 간격 등 레거시 연동) */
  onSubscriptionHealth?: (subscribed: boolean) => void;
  /** 연결 단계 표시(메신저 스트립) */
  onConnectionState?: (state: ChatRoomRealtimeConnectionState) => void;
}) {
  const { roomId, mode, enabled, bootstrapReady = true, includeHiddenMessages = false, hiddenReasonPrefix } = args;
  const effectiveEnabled = enabled && bootstrapReady;
  const onMessageRef = useRef(args.onMessage);
  const onRemovedRef = useRef(args.onMessageRemoved);
  const onHealthRef = useRef(args.onSubscriptionHealth);
  const onConnRef = useRef(args.onConnectionState);
  onMessageRef.current = args.onMessage;
  onRemovedRef.current = args.onMessageRemoved;
  onHealthRef.current = args.onSubscriptionHealth;
  onConnRef.current = args.onConnectionState;

  useEffect(() => {
    let cancelled = false;
    let connectGen = 0;
    let currentChannel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const emitConn = (s: ChatRoomRealtimeConnectionState) => {
      onConnRef.current?.(s);
      onHealthRef.current?.(s === "live");
    };

    const clearRetry = () => {
      if (retryTimer != null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    async function removeChannel() {
      const sb = getSupabaseClient();
      if (!sb || !currentChannel) {
        currentChannel = null;
        return;
      }
      const ch = currentChannel;
      currentChannel = null;
      try {
        await sb.removeChannel(ch);
      } catch {
        /* ignore */
      }
    }

    function scheduleReconnect() {
      if (cancelled || !effectiveEnabled || !roomId || retryTimer != null) return;
      emitConn("reconnecting");
      const exp = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, attempt));
      attempt = Math.min(attempt + 1, 12);
      const jitter = Math.random() * 350;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!cancelled) void connect();
      }, exp + jitter);
    }

    async function connect() {
      if (cancelled || !effectiveEnabled || !roomId) {
        emitConn("disabled");
        return;
      }
      const sb = getSupabaseClient();
      if (!sb) {
        emitConn("fallback");
        scheduleReconnect();
        return;
      }

      const myGen = ++connectGen;
      await removeChannel();
      if (cancelled || myGen !== connectGen) return;

      await waitForSupabaseRealtimeAuth(sb);
      if (cancelled || myGen !== connectGen) return;

      emitConn(attempt > 0 ? "reconnecting" : "connecting");

      const table =
        mode === "integrated"
          ? "chat_messages"
          : mode === "group"
            ? "group_messages"
            : "product_chat_messages";
      const col = mode === "integrated" || mode === "group" ? "room_id" : "product_chat_id";
      const filter = `${col}=eq.${roomId}`;

      const channel = sb
        .channel(`kasama-chat:${table}:${roomId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter },
          (payload) => {
            try {
              if (payload.eventType === "DELETE") {
                const id = (payload.old as Record<string, unknown> | undefined)?.id;
                if (typeof id === "string") onRemovedRef.current?.(id);
                return;
              }
              const row = payload.new as Record<string, unknown> | undefined;
              const msg =
                mode === "integrated"
                  ? integratedChatRowToMessage(row, {
                      includeHiddenMessages,
                      hiddenReasonPrefix,
                    })
                  : mode === "group"
                    ? groupMessageRowToChatMessage(row)
                    : row
                      ? mapProductChatMessageRow(row)
                      : null;
              if (!msg && mode === "integrated" && payload.eventType === "UPDATE") {
                const id = row?.id;
                if (typeof id === "string") onRemovedRef.current?.(id);
                return;
              }
              if (!msg && mode === "group" && payload.eventType === "UPDATE") {
                const r = row;
                if (r?.deleted_at != null || r?.hidden_by_moderator === true) {
                  const id = r?.id;
                  if (typeof id === "string") onRemovedRef.current?.(id);
                }
                return;
              }
              if (msg) onMessageRef.current(msg);
            } catch {
              /* ignore */
            }
          }
        )
        .subscribe((status, err) => {
          if (cancelled || myGen !== connectGen) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            clearRetry();
            emitConn("live");
            return;
          }
          if (err) {
            emitConn("fallback");
            void removeChannel();
            scheduleReconnect();
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            emitConn("fallback");
            void removeChannel();
            scheduleReconnect();
          }
        });

      currentChannel = channel;
    }

    const onVisibility = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      if (!effectiveEnabled || !roomId || cancelled) return;
      attempt = 0;
      clearRetry();
      void connect();
    };

    if (!effectiveEnabled || !roomId) {
      emitConn("disabled");
      return () => {
        cancelled = true;
        clearRetry();
      };
    }

    void connect();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      connectGen += 1;
      clearRetry();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      void removeChannel();
      emitConn("disabled");
    };
  }, [roomId, mode, enabled, bootstrapReady, includeHiddenMessages, hiddenReasonPrefix]);
}
