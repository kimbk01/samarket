"use client";

import { isAdminRecipientNotificationType } from "@/lib/admin/notifications/admin-notification-kinds";
import { isMessengerOwnedNotificationKind } from "@/lib/notifications/core/notification-event-kind";
import {
  isCallPresentationExcluded,
  resolveNotificationPresentation,
} from "@/lib/notifications/display/notification-presentation";
import { defaultInboxFallbackHref, type InboxHrefRow } from "@/lib/notifications/resolve-notification-inbox-href";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import {
  useInAppNotificationBannerStore,
  type InAppNotificationBannerPush,
} from "@/lib/notifications/in-app-banner/in-app-notification-banner-store";

/**
 * 회원 알림(주문·공지·시스템·커뮤니티·거래) → 앱 안 배너.
 * 신호 = 기존 `notification_events` INSERT Realtime (`NotificationsBadgeRealtimeBridge` → `onInsertSound`).
 * 새 구독·폴링 없음. 행은 `adaptNotificationEventInsertToLegacyRow` 형태.
 */

export type MemberInAppBannerSkipReason =
  | "not_event_row"
  | "not_visible"
  | "excluded_type"
  | "chat_owned_by_messenger"
  | "call_or_missed_call"
  | "support_own_banner"
  | "messenger_owned_kind"
  | "muted"
  | "already_read"
  | "empty_text"
  | "notifications_center_open"
  | "destination_open"
  | "duplicate";

export type MemberInAppBannerDecision =
  | { show: true; push: InAppNotificationBannerPush }
  | { show: false; reason: MemberInAppBannerSkipReason };

/** 다른 경로가 맡거나 회원 대상이 아닌 종류 */
const EXCLUDED_EVENT_TYPES = new Set(["incoming_call_signal", "admin_test"]);

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function pathOnly(href: string): string {
  const cut = href.split(/[?#]/)[0] ?? href;
  return cut.length > 1 ? cut.replace(/\/+$/, "") : cut;
}

export function isNotificationsCenterPath(pathname: string): boolean {
  const p = pathOnly(pathname);
  return p === "/notifications" || p.startsWith("/notifications/");
}

export function resolveMemberInAppNotificationBanner(
  row: Record<string, unknown>,
  ctx: { pathname: string; visible: boolean; currentDedupeKey?: string | null }
): MemberInAppBannerDecision {
  if (text(row.source) !== "event") return { show: false, reason: "not_event_row" };
  if (!ctx.visible) return { show: false, reason: "not_visible" };

  const eventType = text(row.event_type ?? row.type);
  const notificationType = text(row.notification_type);
  const meta = record(row.meta);
  const eventKind = text(row.event_kind) || text(meta?.kind);

  if (EXCLUDED_EVENT_TYPES.has(eventType) || isAdminRecipientNotificationType(eventType)) {
    return { show: false, reason: "excluded_type" };
  }
  /** 채팅 4종(일반·그룹·거래·주문 채팅)은 모두 메신저 방 — 메신저 배너가 맡는다(중복 방지). */
  if (notificationType === "chat") return { show: false, reason: "chat_owned_by_messenger" };
  /** 통화·부재중은 통화 규정 대상 — 방 부재중은 메신저 배너(call_stub)가 맡는다. */
  if (eventType === "missed_call" || isCallPresentationExcluded({ notification_type: notificationType })) {
    return { show: false, reason: "call_or_missed_call" };
  }
  /** 고객센터 답변은 `SupportInAppNoticeHost` 가 맡는다. */
  if (eventType.startsWith("support_")) return { show: false, reason: "support_own_banner" };
  /** 친구 요청·선물·그룹 초대 — 메신저 소속(친구 요청은 중앙 팝업 유지). */
  if (isMessengerOwnedNotificationKind(eventKind)) return { show: false, reason: "messenger_owned_kind" };
  if (row.muted_snapshot === true) return { show: false, reason: "muted" };
  if (row.is_read === true || text(row.read_at)) return { show: false, reason: "already_read" };

  const presentation = resolveNotificationPresentation({
    notification_type: notificationType || null,
    title: text(row.title) || null,
    body: text(row.body) || null,
    meta,
    occurred_at: text(row.created_at) || null,
    push_kind: text(row.push_kind) || null,
    event_type: eventType || null,
    bell_presentation_type: text(row.bell_presentation_type) || null,
    campaign_type: text(row.campaign_type) || null,
  });
  if (!presentation.title && !presentation.body) return { show: false, reason: "empty_text" };

  if (isNotificationsCenterPath(ctx.pathname)) return { show: false, reason: "notifications_center_open" };

  const notificationId = text(row.id) || null;
  const inboxRow: InboxHrefRow = {
    id: notificationId,
    notification_type: notificationType,
    link_url: text(row.link_url) || null,
    meta,
    push_kind: text(row.push_kind) || null,
    bell_presentation_type: text(row.bell_presentation_type) || null,
    event_type: eventType || null,
    campaign_type: text(row.campaign_type) || null,
  };
  const href = resolveNotificationDestination({
    inboxRow,
    notificationId,
    fallbackHref: defaultInboxFallbackHref(),
  }).href;
  if (pathOnly(href) === pathOnly(ctx.pathname)) return { show: false, reason: "destination_open" };

  const dedupeKey = `notification:${notificationId || text(row.dedupe_key) || presentation.threadKey}`;
  if (ctx.currentDedupeKey && ctx.currentDedupeKey === dedupeKey) return { show: false, reason: "duplicate" };

  return {
    show: true,
    push: {
      presentation,
      target: { type: "notification", notificationId, inboxRow, href },
      dedupeKey,
    },
  };
}

/** Realtime INSERT 행 → 배너 (앱이 보이는 동안만). 띄웠으면 true. */
export function pushMemberInAppNotificationBannerFromRealtimeRow(row: Record<string, unknown>): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const store = useInAppNotificationBannerStore.getState();
  const decision = resolveMemberInAppNotificationBanner(row, {
    pathname: window.location.pathname,
    visible: document.visibilityState === "visible",
    currentDedupeKey: store.banner?.dedupeKey ?? null,
  });
  if (!decision.show) return false;
  store.pushOrMerge(decision.push);
  return true;
}
