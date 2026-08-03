/**
 * badge-count JSON → ProjectionInput → Builder → Apply.
 * Fact adapter only — does not invent Domain unread.
 */
"use client";

import {
  EMPTY_BELL_BADGE_FACTS,
  type NotificationBadgeProjectionInput,
  type NotificationNonChatEventAttentionFacts,
} from "@/lib/notifications/build-notification-badge-projection";
import { normalizeNotificationBadgeCountPayload } from "@/lib/notifications/notification-badge-count-store";
import { commitCompleteProjectionSnapshot } from "@/lib/notifications/projection-authority";
import { logBadgeFdProbe } from "@/lib/notifications/badge-fd-probe-log";
import { commitMemberAppIconAuthorityFromHttpBody } from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority-commit";

export type BadgeCountAuthorityJson = {
  authority?: string;
  projectionVersionMs?: number;
  domainAppIcon?: {
    messenger?: number;
    trade?: number;
    storeOrder?: number;
    /**
     * Legacy wire: notification axis fallback when Member A digit absent.
     * Prefer `memberUnreadNotificationCount` when both present.
     */
    missedCall?: number;
  };
  domainUnreadRooms?: {
    general_direct?: number;
    group?: number;
    trade?: number;
    store_order?: number;
  };
  storeOrderBuyerDeliveryUnread?: number;
  storeOrderOwnerChatUnread?: number;
  philifeChatUnread?: number;
  nonChatEventAttention?: Partial<NotificationNonChatEventAttentionFacts>;
  /** Phase B App Icon notification axis (may include owner_intake until Slice 2-5). */
  notificationAttentionTotal?: number;
  /** Slice 2-2 — Member Bell digit = A_member only. */
  memberUnreadNotificationCount?: number;
  /** True orphan missed_call event count (diagnostics); optional. */
  orphanMissedCallCount?: number;
  /** Slice 2-3 — distinct call/session ids for B_member missed. */
  unresolvedMissedCallIds?: readonly string[];
  unreadApprovedNotificationEvents?: number;
  missedCallByRoom?: Record<string, number>;
  /** Gate 3 Step 6 — canonical App Icon snapshot (components + authorityVersion). */
  memberAppIconAuthority?: unknown;
  [key: string]: unknown;
};

/**
 * Notification axis for projection input.
 * Prefer Member A digit (`memberUnreadNotificationCount`) over legacy
 * `notificationAttentionTotal` when both are present.
 */
function resolveNotificationAttentionTotal(
  body: BadgeCountAuthorityJson,
  legacyFallback: number
): number {
  if (body.memberUnreadNotificationCount != null) {
    return Math.max(0, Math.floor(Number(body.memberUnreadNotificationCount) || 0));
  }
  if (body.notificationAttentionTotal != null) {
    return Math.max(0, Math.floor(Number(body.notificationAttentionTotal) || 0));
  }
  if (body.domainAppIcon?.missedCall != null) {
    return Math.max(0, Math.floor(Number(body.domainAppIcon.missedCall) || 0));
  }
  return Math.max(0, Math.floor(Number(legacyFallback) || 0));
}

/** Product Bell digit = A_member (N) — prefer projection.bellTotal / total. */
function resolveMemberBellDigit(body: BadgeCountAuthorityJson, fallback: number): number {
  const proj = body.projection;
  if (proj && typeof proj === "object") {
    const bellTotal = (proj as { bellTotal?: unknown }).bellTotal;
    if (bellTotal != null) return Math.max(0, Math.floor(Number(bellTotal) || 0));
  }
  if (body.total != null) {
    return Math.max(0, Math.floor(Number(body.total) || 0));
  }
  // N-only fallback (legacy)
  if (body.memberUnreadNotificationCount != null) {
    return Math.max(0, Math.floor(Number(body.memberUnreadNotificationCount) || 0));
  }
  return Math.max(0, Math.floor(Number(fallback) || 0));
}

function resolveOrphanMissedCall(
  body: BadgeCountAuthorityJson,
  bell: { missedCall?: number }
): number {
  if (body.orphanMissedCallCount != null) {
    return Math.max(0, Math.floor(Number(body.orphanMissedCallCount) || 0));
  }
  const proj = body.projection;
  if (proj && typeof proj === "object") {
    const nested = (proj as { orphanMissedCallCount?: unknown }).orphanMissedCallCount;
    if (nested != null) {
      return Math.max(0, Math.floor(Number(nested) || 0));
    }
  }
  // When Phase B notificationAttention is explicit, do not treat icon.missedCall as orphan
  // (prod wire overloads missedCall = A+B_missed or NotificationAttentionTotal).
  if (body.notificationAttentionTotal != null) {
    return 0;
  }
  return Math.max(
    0,
    Math.floor(Number(body.domainAppIcon?.missedCall ?? bell.missedCall) || 0)
  );
}

function nonChatFromBody(body: BadgeCountAuthorityJson): NotificationNonChatEventAttentionFacts {
  const n = body.nonChatEventAttention;
  if (n && typeof n === "object") {
    return {
      tradeStatus: Math.max(0, Math.floor(Number(n.tradeStatus) || 0)),
      orderStatus: Math.max(0, Math.floor(Number(n.orderStatus) || 0)),
      deliveryStatus: Math.max(0, Math.floor(Number(n.deliveryStatus) || 0)),
      communityActivity: Math.max(0, Math.floor(Number(n.communityActivity) || 0)),
      adminNotice: Math.max(0, Math.floor(Number(n.adminNotice) || 0)),
    };
  }
  const bell = normalizeNotificationBadgeCountPayload(body) ?? EMPTY_BELL_BADGE_FACTS;
  return {
    tradeStatus: Math.max(0, Math.floor(Number(bell.tradeStatus) || 0)),
    orderStatus: Math.max(0, Math.floor(Number(bell.orderStatus) || 0)),
    deliveryStatus: Math.max(0, Math.floor(Number(bell.deliveryStatus) || 0)),
    communityActivity: Math.max(0, Math.floor(Number(bell.communityActivity) || 0)),
    adminNotice: Math.max(0, Math.floor(Number(bell.adminNotice) || 0)),
  };
}

/**
 * Normalize badge-count (or Atomic projection Facts) into the single ProjectionInput.
 */
export function projectionInputFromBadgeCountAuthorityJson(
  body: BadgeCountAuthorityJson
): NotificationBadgeProjectionInput | null {
  const rooms = body.domainUnreadRooms;
  if (rooms && typeof rooms === "object") {
    const bell = normalizeNotificationBadgeCountPayload(body) ?? EMPTY_BELL_BADGE_FACTS;
    const unreadApproved =
      body.unreadApprovedNotificationEvents != null
        ? Math.max(0, Math.floor(Number(body.unreadApprovedNotificationEvents) || 0))
        : body.projection && typeof body.projection === "object"
          ? Math.max(
              0,
              Math.floor(Number((body.projection as { bellTotal?: number }).bellTotal) || 0)
            )
          : Math.max(0, Math.floor(Number(bell.total) || 0));
    const notificationAttentionTotal = resolveNotificationAttentionTotal(body, 0);
    const memberUnreadNotificationCount = resolveMemberBellDigit(body, bell.total);
    return {
      domainUnreadRooms: {
        general_direct: Math.max(0, Math.floor(Number(rooms.general_direct) || 0)),
        group: Math.max(0, Math.floor(Number(rooms.group) || 0)),
        trade: Math.max(0, Math.floor(Number(rooms.trade) || 0)),
        store_order: Math.max(0, Math.floor(Number(rooms.store_order) || 0)),
      },
      storeOrderBuyerDeliveryUnread: Math.max(
        0,
        Math.floor(Number(body.storeOrderBuyerDeliveryUnread) || 0)
      ),
      ...(body.storeOrderOwnerChatUnread != null
        ? {
            storeOrderOwnerChatUnread: Math.max(
              0,
              Math.floor(Number(body.storeOrderOwnerChatUnread) || 0)
            ),
          }
        : {}),
      philifeChatUnread: Math.max(0, Math.floor(Number(body.philifeChatUnread) || 0)),
      orphanMissedCall: resolveOrphanMissedCall(body, bell),
      nonChatEventAttention: nonChatFromBody(body),
      notificationAttentionTotal,
      memberUnreadNotificationCount,
      ...(Array.isArray(body.unresolvedMissedCallIds)
        ? { unresolvedMissedCallIds: body.unresolvedMissedCallIds.map(String) }
        : {}),
      unreadApprovedNotificationEvents: unreadApproved,
      bell: { ...bell, total: memberUnreadNotificationCount },
      rowUnreadByRoomId: body.missedCallByRoom ?? {},
    };
  }
  const icon = body.domainAppIcon;
  if (!icon || typeof icon !== "object") return null;
  const messenger = Math.max(0, Math.floor(Number(icon.messenger) || 0));
  const trade = Math.max(0, Math.floor(Number(icon.trade) || 0));
  const storeOrder = Math.max(0, Math.floor(Number(icon.storeOrder) || 0));
  const buyer = Math.max(0, Math.floor(Number(body.storeOrderBuyerDeliveryUnread) || 0));
  const ownerExplicit =
    body.storeOrderOwnerChatUnread != null
      ? Math.max(0, Math.floor(Number(body.storeOrderOwnerChatUnread) || 0))
      : null;
  const owner = ownerExplicit != null ? ownerExplicit : Math.max(0, storeOrder - buyer);
  const bell = normalizeNotificationBadgeCountPayload(body) ?? EMPTY_BELL_BADGE_FACTS;
  const unreadApproved =
    body.unreadApprovedNotificationEvents != null
      ? Math.max(0, Math.floor(Number(body.unreadApprovedNotificationEvents) || 0))
      : Math.max(0, Math.floor(Number(bell.total) || 0));
  const notificationAttentionTotal = resolveNotificationAttentionTotal(body, 0);
  const memberUnreadNotificationCount = resolveMemberBellDigit(body, bell.total);
  return {
    domainUnreadRooms: {
      general_direct: messenger,
      group: 0,
      trade,
      store_order: owner + buyer,
    },
    storeOrderBuyerDeliveryUnread: buyer,
    ...(ownerExplicit != null
      ? { storeOrderOwnerChatUnread: ownerExplicit }
      : { storeOrderOwnerChatUnread: owner }),
    orphanMissedCall: resolveOrphanMissedCall(body, bell),
    nonChatEventAttention: nonChatFromBody(body),
    notificationAttentionTotal,
    memberUnreadNotificationCount,
    unreadApprovedNotificationEvents: unreadApproved,
    bell: { ...bell, total: memberUnreadNotificationCount },
    rowUnreadByRoomId: body.missedCallByRoom ?? {},
  };
}

export function applyAuthorityJsonAsProjection(
  body: BadgeCountAuthorityJson | Record<string, unknown>,
  opts?: { applyBell?: boolean; projectionVersionMs?: number }
): boolean {
  const b = body as BadgeCountAuthorityJson;
  logBadgeFdProbe("projection_payload.receive", {
    authority: typeof b.authority === "string" ? b.authority : null,
    bellTotal: b.notificationAttentionTotal ?? (b as { total?: unknown }).total ?? null,
    appIcon_messenger: b.domainAppIcon?.messenger ?? null,
    appIcon_trade: b.domainAppIcon?.trade ?? null,
    appIcon_storeOrder: b.domainAppIcon?.storeOrder ?? null,
    general_direct: b.domainUnreadRooms?.general_direct ?? null,
    applyBell: opts?.applyBell !== false,
  });
  const input = projectionInputFromBadgeCountAuthorityJson(body as BadgeCountAuthorityJson);
  if (!input) {
    logBadgeFdProbe("projection_payload.reject", { reason: "projection_input_null" });
    return false;
  }
  const versionMs = Math.max(
    0,
    Math.floor(
      Number(opts?.projectionVersionMs ?? (body as BadgeCountAuthorityJson).projectionVersionMs) ||
        Date.now()
    )
  );
  /** Gate 3 Step 6 — App Icon snapshot version gate (stale Cap/HTTP cannot overwrite). */
  if ((body as BadgeCountAuthorityJson).memberAppIconAuthority != null) {
    const iconPub = commitMemberAppIconAuthorityFromHttpBody(
      body as Record<string, unknown>
    );
    if (!iconPub.ok && iconPub.reason === "STALE_VERSION") {
      logBadgeFdProbe("projection_payload.reject", {
        reason: "app_icon_stale_version",
        versionMs,
      });
      return false;
    }
    if (!iconPub.ok && iconPub.reason === "MEMBER_MISMATCH") {
      logBadgeFdProbe("projection_payload.reject", {
        reason: "app_icon_member_mismatch",
        versionMs,
      });
      return false;
    }
  }

  /** P0: complete HTTP snapshot registers in Projection Authority (sole apply gate). */
  const ok = commitCompleteProjectionSnapshot(input, {
    projectionVersionMs: versionMs,
    source: "badge_count_http",
    applyBell: opts?.applyBell !== false,
  });
  logBadgeFdProbe("projection_payload.commit", {
    ok,
    notificationAttentionTotal: input.notificationAttentionTotal ?? null,
    general_direct: input.domainUnreadRooms.general_direct,
    versionMs,
  });
  return ok;
}
