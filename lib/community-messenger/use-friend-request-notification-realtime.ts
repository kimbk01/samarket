"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import type { CommunityMessengerFriendRequestStatus } from "@/lib/community-messenger/types";

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
    }
  | {
      kind: "friend_status_changed";
      requestId: string;
      status: Exclude<CommunityMessengerFriendRequestStatus, "blocked">;
      requesterUserId: string;
      addresseeUserId: string;
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

/** 알림 행 누락·지연 시에도 홈 `data.requests`·벨이 CFR INSERT 로 맞도록 */
function parseIncomingFriendRequestRow(
  row: Record<string, unknown>,
  viewerUserId: string
): FriendRequestNotificationEvent | null {
  const id = trimString(row.id);
  const status = trimString(row.status);
  const requesterId = trimString(row.requester_id);
  const addresseeId = trimString(row.addressee_id);
  const createdAt =
    typeof row.created_at === "string" && row.created_at.trim()
      ? row.created_at
      : new Date().toISOString();
  if (!id || status !== "pending" || addresseeId !== viewerUserId || !requesterId) return null;
  return {
    kind: "friend_request",
    requestId: id,
    requesterUserId: requesterId,
    requesterLabel: "",
    createdAt,
  };
}

function parseFriendRequestStatusRow(
  row: Record<string, unknown>,
  viewerUserId: string
): FriendRequestNotificationEvent | null {
  const id = trimString(row.id);
  const rawStatus = trimString(row.status);
  const requesterId = trimString(row.requester_id);
  const addresseeId = trimString(row.addressee_id);
  const createdAt =
    trimString(row.responded_at) ||
    trimString(row.updated_at) ||
    trimString(row.created_at) ||
    new Date().toISOString();
  if (!id || !requesterId || !addresseeId) return null;
  if (viewerUserId !== requesterId && viewerUserId !== addresseeId) return null;
  if (rawStatus !== "accepted" && rawStatus !== "rejected" && rawStatus !== "cancelled") {
    return null;
  }
  return {
    kind: "friend_status_changed",
    requestId: id,
    status: rawStatus,
    requesterUserId: requesterId,
    addresseeUserId: addresseeId,
    createdAt,
  };
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
    seenRef.current.clear();
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;

    const dedupeKeyForEvent = (ev: FriendRequestNotificationEvent): string => {
      if (ev.kind === "friend_accepted") return `friend_notif:${ev.requestId}:accepted`;
      if (ev.kind === "friend_rejected") return `friend_notif:${ev.requestId}:rejected`;
      if (ev.kind === "friend_status_changed") {
        return `friend_cfr:${ev.requestId}:${ev.status}`;
      }
      return `${ev.kind}:${ev.requestId}`;
    };

    const emitDeduped = (ev: FriendRequestNotificationEvent) => {
      const dedupeKey = dedupeKeyForEvent(ev);
      if (seenRef.current.has(dedupeKey)) return;
      seenRef.current.add(dedupeKey);
      onEventRef.current(ev);
    };

    const sub = subscribeWithRetry({
      sb,
      name: `messenger:friend-requests-notif:${userId}`,
      scope: `messenger:friend-requests-notif:${userId}`,
      isCancelled: () => cancelled,
      silentAfterMs: 18_000,
      build: (channel) =>
        channel
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
              emitDeduped(ev);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "community_friend_requests",
              filter: `addressee_id=eq.${userId}`,
            },
            (payload) => {
              const row = (payload as { new?: Record<string, unknown> }).new ?? {};
              const ev = parseIncomingFriendRequestRow(row, userId);
              if (!ev || ev.kind !== "friend_request") return;
              emitDeduped(ev);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "community_friend_requests",
              filter: `addressee_id=eq.${userId}`,
            },
            (payload) => {
              const row = (payload as { new?: Record<string, unknown> }).new ?? {};
              const ev = parseFriendRequestStatusRow(row, userId);
              if (!ev || ev.kind !== "friend_status_changed") return;
              emitDeduped(ev);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "community_friend_requests",
              filter: `requester_id=eq.${userId}`,
            },
            (payload) => {
              const row = (payload as { new?: Record<string, unknown> }).new ?? {};
              const ev = parseFriendRequestStatusRow(row, userId);
              if (!ev || ev.kind !== "friend_status_changed") return;
              emitDeduped(ev);
            }
          ),
    });

    return () => {
      cancelled = true;
      sub.stop();
    };
  }, [enabled, userId]);
}

