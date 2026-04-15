"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export type FriendRequestNotificationEvent =
  | {
      kind: "friend_request";
      requestId: string;
      requesterUserId: string;
      requesterLabel: string;
      createdAt: string;
    }
  | {
      kind: "friend_accepted" | "friend_rejected";
      requestId: string;
      addresseeUserId: string;
      addresseeLabel: string;
      createdAt: string;
    };

function trimString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseEvent(row: Record<string, unknown>): FriendRequestNotificationEvent | null {
  const meta = (row.meta ?? null) as Record<string, unknown> | null;
  if (!meta) return null;
  const kind = trimString(meta.kind);
  const createdAt = trimString(row.created_at) || new Date().toISOString();
  if (kind === "friend_request") {
    const requestId = trimString(meta.request_id);
    if (!requestId) return null;
    return {
      kind: "friend_request",
      requestId,
      requesterUserId: trimString(meta.requester_user_id),
      requesterLabel: trimString(meta.requester_label),
      createdAt,
    };
  }
  if (kind === "friend_accepted" || kind === "friend_rejected") {
    const requestId = trimString(meta.request_id);
    if (!requestId) return null;
    return {
      kind,
      requestId,
      addresseeUserId: trimString(meta.addressee_user_id),
      addresseeLabel: trimString(meta.addressee_label),
      createdAt,
    };
  }
  return null;
}

export function useFriendRequestNotificationRealtime(
  userId: string | null,
  enabled: boolean,
  onEvent: (ev: FriendRequestNotificationEvent) => void
) {
  const onEventRef = useRef(onEvent);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    const channel = sb
      .channel(`messenger:friend-requests-notif:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = (payload as { new?: Record<string, unknown> }).new ?? {};
          const ev = parseEvent(row);
          if (!ev) return;
          const dedupeKey = `${ev.kind}:${ev.requestId}`;
          if (seenRef.current.has(dedupeKey)) return;
          seenRef.current.add(dedupeKey);
          onEventRef.current(ev);
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [enabled, userId]);
}

