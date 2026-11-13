"use client";

/**
 * 부재중 통화 앱 안 배너 — 단일 근거 = 부재중 알림 행(`notification_events` type `missed_call`, 통화 1건당 1행).
 * docs/audit/call-cancel-callee-missed-design-2026-11-13.md §11 D7.
 *
 * 왜 여기인가(실측 2026-11-13 05:38~05:41 PHT): 안 읽은 수 증가 순간에 배너를 판정하면, 발신자 취소는 그 순간이
 * DIBAY 통화 화면이 닫히는 도중(WebView hidden)이라 배너가 버려졌다. 부재중 알림 행은 세 시험 모두 화면이 다시 보인
 * 뒤 도착했다. 순서가 바뀌는 경우(D7-2)는 「이 통화가 DIBAY 통화 화면에서 끝났다」(네이티브 `dibay:call-event`
 * `call_terminal`)일 때만 1건 보류했다가 다시 보일 때 띄운다 — 앱이 정말 뒤에 있던 경우는 시스템 알림이 이미 떴으므로
 * 보류하지 않는다.
 *
 * 띄우지 않는 때: 그 대화방을 보고 있음 · 방 알림 끔(`muted_snapshot`) · 채팅 알림 끔 · 다시 보일 때 이미 읽음(안 읽은 수 0).
 */

import { buildRoomBoundMissedCallNotificationInput } from "@/lib/community-messenger/call-authority/call-missed-notification-authority";
import { pushMessengerInAppMessageBanner } from "@/lib/community-messenger/notifications/messenger-in-app-banner-store";
import { peekMessengerRoomUnreadFact } from "@/lib/community-messenger/unread/messenger-room-unread-authority";
import { getNotificationSoundGateSnapshot } from "@/lib/notifications/notification-sound-gate-snapshot";
import { peekBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function payloadOf(row: Record<string, unknown>): Record<string, unknown> {
  const p = row.display_payload;
  return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
}

/** 네이티브 통화 화면에서 끝난 통화 — `dibay:call-event` `call_terminal` 로 받은 sessionId (최근 것만) */
const nativeTerminatedCallIds = new Map<string, number>();
const NATIVE_TERMINATED_KEEP = 8;
let trackerInstalled = false;

function noteNativeTerminatedCall(sessionId: string): void {
  const id = sessionId.trim();
  if (!id) return;
  nativeTerminatedCallIds.delete(id);
  nativeTerminatedCallIds.set(id, Date.now());
  while (nativeTerminatedCallIds.size > NATIVE_TERMINATED_KEEP) {
    const oldest = nativeTerminatedCallIds.keys().next().value;
    if (oldest === undefined) break;
    nativeTerminatedCallIds.delete(oldest);
  }
}

/** 앱 시작 시 1회 — 네이티브 통화 종료 신호 기록. 중복 설치 무시. */
export function installMissedCallBannerNativeTerminalTracker(): void {
  if (trackerInstalled || typeof window === "undefined") return;
  trackerInstalled = true;
  window.addEventListener("dibay:call-event", (ev: Event) => {
    const detail = (ev as CustomEvent<{ type?: unknown; sessionId?: unknown }>).detail;
    if (!detail || detail.type !== "call_terminal") return;
    noteNativeTerminatedCall(trimText(detail.sessionId));
  });
}

type PendingMissedBanner = { roomId: string; sessionId: string; banner: Parameters<typeof pushMessengerInAppMessageBanner>[0] };
let pending: PendingMissedBanner | null = null;
let visibilityListenerInstalled = false;

function viewingRoom(roomId: string): boolean {
  if (typeof window !== "undefined") {
    const m = window.location.pathname.match(/^\/community-messenger\/rooms\/([^/]+)\/?$/);
    if (m?.[1]) {
      let path = m[1];
      try {
        path = decodeURIComponent(m[1]);
      } catch {
        /* keep raw */
      }
      if (path === roomId) return true;
    }
  }
  const active = getNotificationSoundGateSnapshot()?.activeCommunityChatRoomId;
  return active != null && String(active).trim() === roomId;
}

function communityChatEnabled(): boolean {
  return getNotificationSoundGateSnapshot()?.userNotificationSettings?.community_chat_enabled !== false;
}

function documentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function flushPendingOnVisible(): void {
  if (!documentVisible() || !pending) return;
  const p = pending;
  pending = null;
  if (viewingRoom(p.roomId)) return;
  const fact = peekMessengerRoomUnreadFact(p.roomId);
  if (fact && fact.unreadCount <= 0) return;
  pushMessengerInAppMessageBanner(p.banner);
}

function ensureVisibilityListener(): void {
  if (visibilityListenerInstalled || typeof document === "undefined") return;
  visibilityListenerInstalled = true;
  document.addEventListener("visibilitychange", flushPendingOnVisible);
}

/**
 * 알림 행 실시간 INSERT 1건 → 부재중이면 메신저 부재중 배너. 반환: 배너를 띄웠거나 보류했으면 true.
 * (`NotificationsBadgeRealtimeBridge` onInsertSound 에서 호출 — 소리 경로와 독립)
 */
export function pushMessengerMissedCallBannerFromRealtimeRow(row: Record<string, unknown>): boolean {
  if (trimText(row.type) !== "missed_call") return false;
  const roomId = trimText(row.room_id);
  const sessionId = trimText(row.call_session_id);
  if (!roomId || !sessionId) return false;
  if (row.muted_snapshot === true) return false;
  if (!communityChatEnabled()) return false;
  if (viewingRoom(roomId)) return false;

  const payload = payloadOf(row);
  const callKindRaw = trimText(payload.callKind ?? payload.call_kind).toLowerCase();
  const display = buildRoomBoundMissedCallNotificationInput({
    recipientUserId: trimText(row.user_id),
    roomId,
    callSessionId: sessionId,
    actorUserId: trimText(row.actor_user_id),
    callKind: callKindRaw === "video" ? "video" : "voice",
    callerDisplayName: trimText(payload.caller_name ?? payload.callerName) || null,
  });
  const title = trimText(row.title) || display.title;
  const preview = trimText(row.body) || trimText(display.body);
  /** 기존 부재중 배너와 같은 출처 — 1:1 대화방 목록 행 사진(없으면 기본 얼굴) */
  const listRow = findHomeListRoomRow(peekBootstrapCache(), roomId);
  const avatarUrl = (listRow?.roomType === "direct" ? trimText(listRow.avatarUrl) : "") || null;
  const banner = { roomId, title, preview, avatarUrl, kind: "missed_call" as const, dedupeKey: `missed:${sessionId}` };

  if (documentVisible()) {
    pushMessengerInAppMessageBanner(banner);
    return true;
  }
  /** D7-2: DIBAY 통화 화면에서 끝난 이 통화만 보류(앱이 정말 뒤였다면 시스템 알림이 이미 떴다) */
  if (!nativeTerminatedCallIds.has(sessionId)) return false;
  pending = { roomId, sessionId, banner };
  ensureVisibilityListener();
  return true;
}

/** 시험 전용 */
export function __resetMissedCallEventBannerForTests(): void {
  nativeTerminatedCallIds.clear();
  pending = null;
}
