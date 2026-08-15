/**
 * P0 — Versioned push envelope (additive FCM data fields).
 * FCM data values are strings only. Does not invent Bell/App Icon digits.
 */
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

export const PUSH_SCHEMA_VERSION_V1 = "1" as const;
export type PushSchemaVersionV1 = typeof PUSH_SCHEMA_VERSION_V1;

/** Explicit origin-unavailable fallback (same as defaultInboxFallbackHref). */
export const PUSH_SAFE_FALLBACK_ROUTE = "/notifications?fallback=origin_unavailable" as const;

export type PushEventClassV1 =
  | "admin_notice"
  | "admin_marketing"
  | "owner_operation";

export type CampaignChannelWire =
  | "push_only"
  | "in_app_only"
  | "push_and_in_app"
  | "test_only";

export type PushEnvelopeParseResult =
  | { present: false }
  | {
      present: true;
      valid: true;
      schemaVersion: PushSchemaVersionV1;
      eventClass: PushEventClassV1;
      campaignChannel: CampaignChannelWire | null;
      campaignId: string | null;
      notificationEventId: string | null;
      targetKind: string;
      storeId: string | null;
      operationType: string | null;
      entityId: string | null;
      targetNotificationId: string | null;
      targetTab: "system" | "marketing" | null;
      approvedRoute: string | null;
      routeKey: string | null;
    }
  | {
      present: true;
      valid: false;
      reason: string;
    };

export type PushEnvelopeRouteResult = {
  path: string;
  reason: "envelope" | "envelope_invalid_fallback";
  fallbackReason?: string;
  eventClass?: PushEventClassV1;
};

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isCampaignChannel(v: string): v is CampaignChannelWire {
  return (
    v === "push_only" ||
    v === "in_app_only" ||
    v === "push_and_in_app" ||
    v === "test_only"
  );
}

function isEventClass(v: string): v is PushEventClassV1 {
  return v === "admin_notice" || v === "admin_marketing" || v === "owner_operation";
}

/** Envelope is "present" when schemaVersion and/or eventClass wire fields exist. */
export function isPushEnvelopeV1Present(data: Record<string, string | undefined>): boolean {
  return Boolean(trim(data.schemaVersion) || trim(data.eventClass));
}

/**
 * Parse flat FCM/APNs data into a typed envelope.
 * Invalid when present but schema/eventClass/target invariants fail.
 */
export function parsePushEnvelopeV1(
  data: Record<string, string | undefined>
): PushEnvelopeParseResult {
  const schemaRaw = trim(data.schemaVersion);
  const eventClassRaw = trim(data.eventClass);
  if (!schemaRaw && !eventClassRaw) return { present: false };

  if (schemaRaw && schemaRaw !== PUSH_SCHEMA_VERSION_V1) {
    return { present: true, valid: false, reason: "unknown_schema_version" };
  }
  if (!eventClassRaw || !isEventClass(eventClassRaw)) {
    return { present: true, valid: false, reason: "unknown_event_class" };
  }

  const schemaVersion: PushSchemaVersionV1 = PUSH_SCHEMA_VERSION_V1;
  const campaignChannelRaw = trim(data.campaignChannel) || trim(data.campaign_channel);
  const campaignChannel =
    campaignChannelRaw && isCampaignChannel(campaignChannelRaw) ? campaignChannelRaw : null;
  const campaignId = trim(data.campaignId) || trim(data.campaign_id) || null;
  const notificationEventId =
    trim(data.notificationEventId) ||
    trim(data.notification_event_id) ||
    trim(data.notificationId) ||
    null;
  const targetKind =
    trim(data.targetKind) ||
    trim(data.target_kind) ||
    (eventClassRaw === "owner_operation" ? "owner_operation" : "notification");
  const storeId = trim(data.storeId) || trim(data.store_id) || null;
  const operationType = trim(data.operationType) || trim(data.operation_type) || null;
  const entityId = trim(data.targetEntityId) || trim(data.entityId) || trim(data.entity_id) || null;
  const targetNotificationId =
    trim(data.targetNotificationId) ||
    trim(data.target_notification_id) ||
    notificationEventId;
  const tabRaw = trim(data.targetTab) || trim(data.target_tab);
  const targetTab =
    tabRaw === "system" || tabRaw === "marketing" ? (tabRaw as "system" | "marketing") : null;
  const routeKey = trim(data.targetRouteKey) || trim(data.routeKey) || null;
  const approvedCandidate =
    trim(data.targetApprovedRoute) ||
    trim(data.approvedRoute) ||
    trim(data.routeUrl) ||
    trim(data.route_url) ||
    "";
  const approvedRoute = approvedCandidate
    ? resolveSafeNotificationInternalRoute(approvedCandidate)
    : null;

  const hasApprovedInternalRoute = targetKind === "approved_internal_route" && !!approvedRoute;

  if (eventClassRaw === "admin_notice") {
    if (!targetNotificationId && !hasApprovedInternalRoute) {
      return { present: true, valid: false, reason: "notice_missing_notification_id" };
    }
  }

  if (eventClassRaw === "admin_marketing") {
    const channel = campaignChannel ?? "push_and_in_app";
    if (channel === "push_only") {
      if (targetKind === "approved_internal_route" && !approvedRoute && !routeKey) {
        return { present: true, valid: false, reason: "marketing_push_only_missing_approved_route" };
      }
    } else if (!targetNotificationId && !hasApprovedInternalRoute) {
      return { present: true, valid: false, reason: "marketing_inbox_missing_notification_id" };
    }
  }

  if (eventClassRaw === "owner_operation") {
    if (!storeId) {
      return { present: true, valid: false, reason: "owner_operation_missing_store_id" };
    }
    if (!operationType) {
      return { present: true, valid: false, reason: "owner_operation_missing_operation_type" };
    }
  }

  return {
    present: true,
    valid: true,
    schemaVersion,
    eventClass: eventClassRaw,
    campaignChannel,
    campaignId,
    notificationEventId,
    targetKind,
    storeId,
    operationType,
    entityId,
    targetNotificationId,
    targetTab,
    approvedRoute,
    routeKey,
  };
}

export function resolveOwnerOperationCanonicalRoute(input: {
  storeId: string;
  operationType: string;
  entityId?: string | null;
}): string {
  const storeId = input.storeId.trim();
  const op = input.operationType.trim().toLowerCase();
  const entityId = input.entityId?.trim() || undefined;
  if (op === "inquiry" || op === "inquiries" || op === "open_inquiry") {
    const q = new URLSearchParams({ storeId });
    if (entityId) q.set("inquiryId", entityId);
    return `/stores/owner/inquiries?${q.toString()}`;
  }
  if (op === "refund" || op === "refund_pending") {
    return buildStoreOrdersHref({ storeId, tab: "refund", orderId: entityId, freshList: true });
  }
  if (op === "cancel" || op === "cancelled" || op === "cancel_pending") {
    return buildStoreOrdersHref({ storeId, tab: "cancelled", orderId: entityId, freshList: true });
  }
  if (
    op === "new_order" ||
    op === "pending_order" ||
    op === "order" ||
    op === "orders" ||
    op === "pending"
  ) {
    return buildStoreOrdersHref({ storeId, tab: "new", orderId: entityId, freshList: true });
  }
  return buildStoreOrdersHref({ storeId, freshList: true });
}

function buildNotificationDetailPath(notificationId: string): string {
  return `/notifications/${encodeURIComponent(notificationId.trim())}`;
}

/**
 * Resolve route from a parsed envelope. Caller must only invoke when present===true.
 */
export function resolveRouteFromPushEnvelopeV1(
  parsed: Extract<PushEnvelopeParseResult, { present: true }>
): PushEnvelopeRouteResult {
  if (!parsed.valid) {
    return {
      path: PUSH_SAFE_FALLBACK_ROUTE,
      reason: "envelope_invalid_fallback",
      fallbackReason: parsed.reason,
    };
  }

  if (parsed.eventClass === "admin_notice") {
    const id = parsed.targetNotificationId!;
    if (parsed.targetKind === "approved_internal_route" && parsed.approvedRoute) {
      return { path: parsed.approvedRoute, reason: "envelope", eventClass: "admin_notice" };
    }
    return {
      path: buildNotificationDetailPath(id),
      reason: "envelope",
      eventClass: "admin_notice",
    };
  }

  if (parsed.eventClass === "admin_marketing") {
    const channel = parsed.campaignChannel ?? "push_and_in_app";
    if (channel === "push_only") {
      if (parsed.approvedRoute) {
        return {
          path: parsed.approvedRoute,
          reason: "envelope",
          eventClass: "admin_marketing",
        };
      }
      return {
        path: PUSH_SAFE_FALLBACK_ROUTE,
        reason: "envelope_invalid_fallback",
        fallbackReason: "marketing_push_only_no_approved_route",
        eventClass: "admin_marketing",
      };
    }
    const id = parsed.targetNotificationId!;
    if (parsed.targetKind === "approved_internal_route" && parsed.approvedRoute) {
      return { path: parsed.approvedRoute, reason: "envelope", eventClass: "admin_marketing" };
    }
    return {
      path: buildNotificationDetailPath(id),
      reason: "envelope",
      eventClass: "admin_marketing",
    };
  }

  // owner_operation
  return {
    path: resolveOwnerOperationCanonicalRoute({
      storeId: parsed.storeId!,
      operationType: parsed.operationType!,
      entityId: parsed.entityId,
    }),
    reason: "envelope",
    eventClass: "owner_operation",
  };
}

/** Flat FCM data fields for additive envelope (all string values). */
export function buildPushEnvelopeV1DataFields(input: {
  eventClass: PushEventClassV1;
  campaignChannel?: CampaignChannelWire | null;
  campaignId?: string | null;
  notificationEventId?: string | null;
  targetKind?: string | null;
  targetTab?: "system" | "marketing" | null;
  targetNotificationId?: string | null;
  storeId?: string | null;
  operationType?: string | null;
  entityId?: string | null;
  approvedRoute?: string | null;
  routeKey?: string | null;
}): Record<string, string> {
  const out: Record<string, string> = {
    schemaVersion: PUSH_SCHEMA_VERSION_V1,
    eventClass: input.eventClass,
  };
  if (input.campaignChannel) out.campaignChannel = input.campaignChannel;
  if (input.campaignId) out.campaignId = input.campaignId;
  if (input.notificationEventId) {
    out.notificationEventId = input.notificationEventId;
    out.notificationId = input.notificationEventId;
  }
  if (input.targetKind) out.targetKind = input.targetKind;
  if (input.targetTab) out.targetTab = input.targetTab;
  if (input.targetNotificationId) out.targetNotificationId = input.targetNotificationId;
  if (input.storeId) out.storeId = input.storeId;
  if (input.operationType) out.operationType = input.operationType;
  if (input.entityId) out.targetEntityId = input.entityId;
  if (input.approvedRoute) {
    const safe = resolveSafeNotificationInternalRoute(input.approvedRoute);
    if (safe) out.targetApprovedRoute = safe;
  }
  if (input.routeKey) out.targetRouteKey = input.routeKey;
  return out;
}
