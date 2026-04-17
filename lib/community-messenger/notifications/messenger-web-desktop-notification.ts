"use client";

import type { MessengerCallStatus } from "@/lib/community-messenger/stores/useCallStore";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { resolveMessengerWebDesktopNotificationIntent } from "@/lib/community-messenger/notifications/messenger-message-notification-policy";
import type { MessengerAppVisibility } from "@/lib/community-messenger/notifications/messenger-notification-state-model";

const recentDedupeAt = new Map<string, number>();
const DEDUPE_MS = 2000;

function requestMessengerMarkReadAfterNotificationClick(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id || typeof window === "undefined") return;
  void fetch(communityMessengerRoomResourcePath(id), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "mark_read" }),
  }).catch(() => {});
  requestMessengerHubBadgeResync("notification_click_mark_read");
}

export type TryMessengerWebDesktopNotificationInput = {
  roomId: string;
  title: string;
  body: string;
  nextUnread: number;
  prevUnread: number;
  activeCommunityRoomId: string | null;
  appVisibility: MessengerAppVisibility;
  windowFocused: boolean;
  communityChatEnabled: boolean;
  callStatus: MessengerCallStatus;
  onNavigateToRoom: (roomId: string) => void;
};

export type TryMessengerWebDesktopNotificationResult =
  | { ok: true; kind: "shown" }
  | { ok: false; kind: "noop"; reason: string };

export function tryShowMessengerWebDesktopNotification(
  input: TryMessengerWebDesktopNotificationInput
): TryMessengerWebDesktopNotificationResult {
  const intent = resolveMessengerWebDesktopNotificationIntent({
    targetRoomId: input.roomId,
    nextUnread: input.nextUnread,
    prevUnread: input.prevUnread,
    activeCommunityRoomId: input.activeCommunityRoomId,
    appVisibility: input.appVisibility,
    windowFocused: input.windowFocused,
    communityChatEnabled: input.communityChatEnabled,
    callStatus: input.callStatus,
  });
  if (!intent.allow || !intent.dedupeKey) {
    return { ok: false, kind: "noop", reason: "policy" };
  }
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return { ok: false, kind: "noop", reason: "no-notification-api" };
  }
  if (Notification.permission !== "granted") {
    return { ok: false, kind: "noop", reason: "permission-not-granted" };
  }
  const now = Date.now();
  const last = recentDedupeAt.get(intent.dedupeKey) ?? 0;
  if (now - last < DEDUPE_MS) {
    return { ok: false, kind: "noop", reason: "deduped" };
  }
  recentDedupeAt.set(intent.dedupeKey, now);

  try {
    const n = new Notification(input.title, {
      body: input.body,
      tag: `samarket-community-messenger:${input.roomId}`,
      silent: true,
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      requestMessengerMarkReadAfterNotificationClick(input.roomId);
      input.onNavigateToRoom(input.roomId);
      n.close();
    };
  } catch {
    return { ok: false, kind: "noop", reason: "notification-threw" };
  }
  return { ok: true, kind: "shown" };
}
