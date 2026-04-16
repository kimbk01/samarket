"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { OrderChatMessagePublic } from "@/lib/order-chat/types";
function mapOrderChatMessageRow(row: Record<string, unknown> | null | undefined): OrderChatMessagePublic | null {
  if (!row) return null;
  const id = typeof row.id === "string" ? row.id : "";
  const room_id = typeof row.room_id === "string" ? row.room_id : "";
  const order_id = typeof row.order_id === "string" ? row.order_id : "";
  if (!id || !room_id || !order_id) return null;
  const st = row.sender_type;
  const sender_type =
    st === "buyer" || st === "owner" || st === "admin" || st === "system" ? st : "system";
  const mt = row.message_type;
  const message_type =
    mt === "text" || mt === "image" || mt === "system" || mt === "admin_note" ? mt : "text";
  const rs = row.related_order_status;
  const related_order_status: OrderChatMessagePublic["related_order_status"] =
    typeof rs === "string" ? (rs as OrderChatMessagePublic["related_order_status"]) : null;
  return {
    id,
    room_id,
    order_id,
    sender_type,
    sender_id: typeof row.sender_id === "string" ? row.sender_id : null,
    sender_name: typeof row.sender_name === "string" ? row.sender_name : "",
    message_type,
    content: typeof row.content === "string" ? row.content : "",
    image_url: typeof row.image_url === "string" ? row.image_url : null,
    related_order_status,
    is_read_by_buyer: Boolean(row.is_read_by_buyer),
    is_read_by_owner: Boolean(row.is_read_by_owner),
    is_read_by_admin: Boolean(row.is_read_by_admin),
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

const ROOM_STALE_DEBOUNCE_MS = 400;

/**
 * 주문 전용 채팅(`order_chat_messages` / `order_chat_rooms`) — 상대 메시지·방 메타를 Realtime 으로 맞춘다.
 * RLS·publication: `20260416120000_order_chat_realtime_rls.sql`
 */
export function useOrderChatRoomRealtime(args: {
  roomId: string | null;
  enabled: boolean;
  onMessageUpsert: (message: OrderChatMessagePublic) => void;
  onMessageRemoved?: (id: string) => void;
  onRoomStale?: () => void;
  onSubscriptionHealth?: (subscribed: boolean) => void;
}): void {
  const upsertRef = useRef(args.onMessageUpsert);
  const removedRef = useRef(args.onMessageRemoved);
  const staleRef = useRef(args.onRoomStale);
  const healthRef = useRef(args.onSubscriptionHealth);
  useEffect(() => {
    upsertRef.current = args.onMessageUpsert;
    removedRef.current = args.onMessageRemoved;
    staleRef.current = args.onRoomStale;
    healthRef.current = args.onSubscriptionHealth;
  }, [args.onMessageUpsert, args.onMessageRemoved, args.onRoomStale, args.onSubscriptionHealth]);

  useEffect(() => {
    if (!args.enabled || !args.roomId?.trim()) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    const rid = args.roomId.trim();
    let cancelled = false;
    let metaTimer: ReturnType<typeof setTimeout> | null = null;
    let ch: RealtimeChannel | null = null;

    const scheduleRoomStale = () => {
      if (!staleRef.current) return;
      if (metaTimer != null) return;
      metaTimer = setTimeout(() => {
        metaTimer = null;
        if (!cancelled) staleRef.current?.();
      }, ROOM_STALE_DEBOUNCE_MS);
    };

    healthRef.current?.(false);
    ch = sb
      .channel(`order-chat-room:${rid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_chat_messages", filter: `room_id=eq.${rid}` },
        (payload) => {
          if (cancelled) return;
          if (payload.eventType === "DELETE") {
            const id = (payload.old as Record<string, unknown> | undefined)?.id;
            if (typeof id === "string") removedRef.current?.(id);
            return;
          }
          const msg = mapOrderChatMessageRow(payload.new as Record<string, unknown> | undefined);
          if (msg) upsertRef.current(msg);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_chat_rooms", filter: `id=eq.${rid}` },
        () => {
          if (!cancelled) scheduleRoomStale();
        }
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          healthRef.current?.(true);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          healthRef.current?.(false);
        }
      });

    return () => {
      cancelled = true;
      healthRef.current?.(false);
      if (metaTimer != null) {
        clearTimeout(metaTimer);
        metaTimer = null;
      }
      if (ch) void sb.removeChannel(ch);
    };
  }, [args.enabled, args.roomId]);
}
