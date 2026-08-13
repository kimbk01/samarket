import { describe, expect, it } from "vitest";
import {
  isAuthRequiredPushRoute,
  resolveFcmPushTypeFromData,
  resolvePushRouteDecisionFromFcmData,
  resolvePushRouteFromFcmData,
  PUSH_SAFE_FALLBACK_ROUTE,
} from "@/lib/push/resolve-push-route-from-fcm-data";
import {
  buildPushEnvelopeV1DataFields,
  parsePushEnvelopeV1,
  resolveOwnerOperationCanonicalRoute,
} from "@/lib/push/push-envelope-v1";
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";
import { shouldApplyMemberNotificationReadOnPushTap } from "@/lib/notifications/badge-authority-rebuild/push-routing-transport";
import { isMemberNotificationAUnread } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";

describe("resolvePushRouteFromFcmData — legacy", () => {
  it("prefers relative url when no envelope", () => {
    expect(resolvePushRouteFromFcmData({ url: "/community-messenger/rooms/r1" })).toBe(
      "/community-messenger/rooms/r1"
    );
  });

  it("prefers explicit routeUrl over inferred route when no envelope", () => {
    expect(
      resolvePushRouteFromFcmData({
        type: "admin_marketing_banner",
        routeUrl: "/community?banner=camp-1",
        roomId: "room-ignored",
      })
    ).toBe("/community?banner=camp-1");
  });

  it("resolves missed_call to logs with callId", () => {
    expect(
      resolvePushRouteFromFcmData({
        type: "missed_call",
        callId: "sess-9",
      })
    ).toBe("/community-messenger/calls/logs?callId=sess-9");
  });

  it("resolves missed_call with roomId to call-history room focus like Android", () => {
    expect(
      resolvePushRouteFromFcmData({
        type: "missed_call",
        roomId: "room-9",
        callId: "sess-9",
      })
    ).toBe("/community-messenger/rooms/room-9?focus=call-history&callId=sess-9");
  });

  it("resolves chat, trade, order, and community route payloads", () => {
    expect(resolvePushRouteFromFcmData({ type: "chat_message", roomId: "cm-1" })).toBe(
      "/community-messenger/rooms/cm-1"
    );
    expect(resolvePushRouteFromFcmData({ type: "trade_message", roomId: "trade-room-1" })).toBe(
      "/community-messenger/rooms/trade-room-1"
    );
    expect(resolvePushRouteFromFcmData({ type: "group_message", roomId: "grp-1" })).toBe(
      "/group-chat/grp-1"
    );
    expect(resolvePushRouteFromFcmData({ type: "delivery_order", orderId: "order-1" })).toBe(
      "/orders/store/order-1"
    );
    expect(
      resolvePushRouteFromFcmData({ type: "delivery_order", roomId: "so-room-1", orderId: "order-1" })
    ).toBe("/community-messenger/rooms/so-room-1");
    expect(resolvePushRouteFromFcmData({ type: "community_comment", postId: "post-1" })).toBe(
      "/community/posts/post-1"
    );
  });

  it("falls back to legacy sessionId for incoming_call", () => {
    expect(
      resolvePushRouteFromFcmData({
        call_push_kind: "incoming_call",
        sessionId: "sess-legacy",
      })
    ).toBe("/community-messenger/calls/sess-legacy");
  });

  it("detects type from legacy dibay_call", () => {
    expect(resolveFcmPushTypeFromData({ dibay_call: "1" })).toBe("incoming_call");
  });

  it("rejects unsafe external schemes and uses the canonical resolver key", () => {
    expect(
      resolvePushRouteFromFcmData({
        routeUrl: "javascript:alert(1)",
        deeplinkResolverKey: "chat_room",
        roomId: "safe-room",
      })
    ).toBe("/community-messenger/rooms/safe-room");
  });

  it("converts absolute notification URLs to internal routes only", () => {
    expect(
      resolvePushRouteFromFcmData({
        routeUrl: "https://external.example/post/post-1?from=notification",
      })
    ).toBe("/post/post-1?from=notification");
  });
});

describe("P0 push envelope resolver", () => {
  it("1. admin_notice + valid notificationId → system tab", () => {
    const data = buildPushEnvelopeV1DataFields({
      eventClass: "admin_notice",
      notificationEventId: "n-notice-1",
      targetKind: "notification",
      targetTab: "system",
      targetNotificationId: "n-notice-1",
    });
    expect(resolvePushRouteFromFcmData(data)).toBe(
      "/notifications?tab=system&notificationId=n-notice-1"
    );
  });

  it("2. admin_marketing + push_and_in_app → marketing tab", () => {
    const data = buildPushEnvelopeV1DataFields({
      eventClass: "admin_marketing",
      campaignChannel: "push_and_in_app",
      notificationEventId: "n-mkt-1",
      targetKind: "notification",
      targetTab: "marketing",
      targetNotificationId: "n-mkt-1",
    });
    expect(resolvePushRouteFromFcmData(data)).toBe(
      "/notifications?tab=marketing&notificationId=n-mkt-1"
    );
  });

  it("3. admin_marketing + in_app_only → inbox canonical", () => {
    const data = buildPushEnvelopeV1DataFields({
      eventClass: "admin_marketing",
      campaignChannel: "in_app_only",
      notificationEventId: "n-mkt-2",
      targetKind: "notification",
      targetNotificationId: "n-mkt-2",
    });
    expect(resolvePushRouteFromFcmData(data)).toBe(
      "/notifications?tab=marketing&notificationId=n-mkt-2"
    );
  });

  it("4. admin_marketing + push_only + approved route", () => {
    const data = buildPushEnvelopeV1DataFields({
      eventClass: "admin_marketing",
      campaignChannel: "push_only",
      targetKind: "approved_internal_route",
      approvedRoute: "/community?banner=camp-9",
    });
    expect(resolvePushRouteFromFcmData(data)).toBe("/community?banner=camp-9");
  });

  it("5. admin_marketing + push_only + no route → fallback, not marketing history", () => {
    const data = {
      schemaVersion: "1",
      eventClass: "admin_marketing",
      campaignChannel: "push_only",
      targetKind: "approved_internal_route",
    };
    const decision = resolvePushRouteDecisionFromFcmData(data);
    expect(decision.path).toBe(PUSH_SAFE_FALLBACK_ROUTE);
    expect(decision.path.includes("tab=marketing")).toBe(false);
    expect(decision.source).toBe("envelope_invalid_fallback");
  });

  it("6. owner_operation + storeId + operation → owner canonical", () => {
    const data = buildPushEnvelopeV1DataFields({
      eventClass: "owner_operation",
      storeId: "store-1",
      operationType: "new_order",
      entityId: "ord-1",
    });
    const path = resolvePushRouteFromFcmData(data) ?? "";
    expect(path.startsWith("/stores/owner/orders?")).toBe(true);
    expect(path).toContain("storeId=store-1");
    expect(path).toContain("tab=new");
  });

  it("7. owner_operation missing storeId → invalid fallback", () => {
    const data = {
      schemaVersion: "1",
      eventClass: "owner_operation",
      operationType: "new_order",
    };
    const decision = resolvePushRouteDecisionFromFcmData(data);
    expect(decision.path).toBe(PUSH_SAFE_FALLBACK_ROUTE);
    expect(decision.fallbackReason).toBe("owner_operation_missing_store_id");
  });

  it("8. unknown eventClass → fallback", () => {
    const decision = resolvePushRouteDecisionFromFcmData({
      schemaVersion: "1",
      eventClass: "not_a_real_class",
    });
    expect(decision.path).toBe(PUSH_SAFE_FALLBACK_ROUTE);
    expect(decision.fallbackReason).toBe("unknown_event_class");
  });

  it("9. unknown schemaVersion → fallback", () => {
    const decision = resolvePushRouteDecisionFromFcmData({
      schemaVersion: "99",
      eventClass: "admin_notice",
      targetNotificationId: "n1",
    });
    expect(decision.path).toBe(PUSH_SAFE_FALLBACK_ROUTE);
    expect(decision.fallbackReason).toBe("unknown_schema_version");
  });

  it("10. new envelope invalid + legacy URL must not bypass", () => {
    const decision = resolvePushRouteDecisionFromFcmData({
      schemaVersion: "1",
      eventClass: "admin_notice",
      // missing notification id → invalid
      routeUrl: "/stores/owner/orders?storeId=evil",
      url: "/stores/owner/orders?storeId=evil",
    });
    expect(decision.path).toBe(PUSH_SAFE_FALLBACK_ROUTE);
    expect(decision.source).toBe("envelope_invalid_fallback");
    expect(decision.path.includes("storeId=evil")).toBe(false);
  });

  it("11. existing chat payload unchanged", () => {
    expect(resolvePushRouteFromFcmData({ type: "chat_message", roomId: "cm-keep" })).toBe(
      "/community-messenger/rooms/cm-keep"
    );
  });

  it("12. existing admin payload without envelope keeps legacy url", () => {
    expect(
      resolvePushRouteFromFcmData({
        type: "notification",
        routeUrl: "/notifications",
      })
    ).toBe("/notifications");
  });
});

describe("P0 URL security", () => {
  it("same-origin approved path PASS", () => {
    expect(resolveSafeNotificationInternalRoute("/notifications?tab=system")).toBe(
      "/notifications?tab=system"
    );
  });
  it("external origin stripped or fail depending on path allowlist", () => {
    expect(resolveSafeNotificationInternalRoute("https://evil.example/hack")).toBeNull();
  });
  it("javascript FAIL", () => {
    expect(resolveSafeNotificationInternalRoute("javascript:alert(1)")).toBeNull();
  });
  it("protocol-relative FAIL", () => {
    expect(resolveSafeNotificationInternalRoute("//evil.example/x")).toBeNull();
  });
  it("empty FAIL", () => {
    expect(resolveSafeNotificationInternalRoute("")).toBeNull();
  });
});

describe("P0 authority open/read", () => {
  it("admin_notice remains Member A eligible when unread", () => {
    expect(
      isMemberNotificationAUnread({
        id: "a1",
        type: "admin_notice",
        category: "admin_notice",
        unread: true,
        read_at: null,
      })
    ).toBe(true);
  });

  it("persistent marketing is Member A unread and contributes to Bell", () => {
    expect(
      isMemberNotificationAUnread({
        id: "m1",
        type: "admin_marketing_banner",
        category: "admin_marketing_banner",
        unread: true,
        read_at: null,
      })
    ).toBe(true);
  });

  it("push tap read: notice and marketing yes, owner_operation no", () => {
    expect(
      shouldApplyMemberNotificationReadOnPushTap({
        eventClass: "admin_notice",
        path: "/notifications?tab=system",
      })
    ).toBe(true);
    expect(
      shouldApplyMemberNotificationReadOnPushTap({
        eventClass: "admin_marketing",
        path: "/notifications?tab=marketing",
      })
    ).toBe(true);
    expect(
      shouldApplyMemberNotificationReadOnPushTap({
        eventClass: "owner_operation",
        path: "/stores/owner/orders?storeId=s1",
      })
    ).toBe(false);
  });

  it("auth-required includes /notifications", () => {
    expect(isAuthRequiredPushRoute("/notifications?tab=system")).toBe(true);
    expect(isAuthRequiredPushRoute("/stores/owner/orders?storeId=s1")).toBe(true);
  });

  it("campaign presentation emits envelope fields into FCM data", () => {
    const presentation = buildAdminCampaignNotificationPresentation({
      title: "Notice",
      body: "Body",
      type: "notice",
      channel: "push_and_in_app",
      campaignId: "camp-1",
      target_url: "/notifications",
    });
    const fields = buildFcmDataFields(presentation.pushPayload, undefined, {
      tag: "t1",
    });
    expect(fields.schemaVersion).toBe("1");
    expect(fields.eventClass).toBe("admin_notice");
    expect(fields.campaignChannel).toBe("push_and_in_app");
    expect(fields.targetTab).toBe("system");
    expect(String(fields.badgeCount)).toMatch(/^\d+$/);
  });

  it("owner operation helper requires storeId semantics", () => {
    expect(
      resolveOwnerOperationCanonicalRoute({
        storeId: "s1",
        operationType: "inquiry",
      })
    ).toContain("/stores/owner/inquiries?");
    const parsed = parsePushEnvelopeV1({
      schemaVersion: "1",
      eventClass: "owner_operation",
      operationType: "new_order",
    });
    expect(parsed.present && !parsed.valid).toBe(true);
  });
});
