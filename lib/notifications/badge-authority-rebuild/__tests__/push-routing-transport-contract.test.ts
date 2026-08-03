/**
 * Gate 3 Step 9 — Push transport contract.
 * FCM Payload → Authority Mutation → Projection → UI → Native
 * Push must not invent Bell / Bottom / App Icon digits.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PUSH_ROUTING_TRANSPORT,
  applyPushTransportEnvelope,
  classifyPushTransport,
  isForbiddenPushSurfaceOp,
  shouldApplyMemberNotificationReadOnPushTap,
} from "@/lib/notifications/badge-authority-rebuild/push-routing-transport";
import { resolveMemberAppIconTotalForNativeFcm } from "@/lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";

const root = process.cwd();

describe("Gate3 Step9 Push Routing Transport", () => {
  it("locks transport authority id", () => {
    expect(PUSH_ROUTING_TRANSPORT).toBe("push_routing_transport_v1");
  });

  it("classifies member A / conversation B / owner C / delivery_only", () => {
    expect(
      classifyPushTransport({
        type: "notification",
        path: "/notifications/n1",
        userId: "u1",
      }).pipeline
    ).toBe("member_notification_a");

    expect(
      classifyPushTransport({
        type: "chat_message",
        roomId: "r1",
        path: "/community-messenger/rooms/r1",
        userId: "u1",
      }).pipeline
    ).toBe("conversation_b");

    expect(
      classifyPushTransport({
        type: "delivery_order",
        storeId: "s1",
        path: "/owner/stores/s1/orders/o1",
        metaKind: "store_order_created",
      })
    ).toMatchObject({
      recipientScope: "store",
      pipeline: "owner_c",
      allowsMemberAReadOnTap: false,
    });

    expect(
      classifyPushTransport({
        pushOnlyPromotion: true,
        path: "/promo",
      }).pipeline
    ).toBe("delivery_only");
  });

  it("forbids FCM/push inventing Bell Bottom App Icon", () => {
    expect(isForbiddenPushSurfaceOp("FCM_BADGE_PLUS_ONE")).toBe(true);
    expect(isForbiddenPushSurfaceOp("PUSH_BELL_INVENT")).toBe(true);
    expect(isForbiddenPushSurfaceOp("PUSH_BOTTOM_INVENT")).toBe(true);
    expect(isForbiddenPushSurfaceOp("PUSH_APP_ICON_INVENT")).toBe(true);
    expect(isForbiddenPushSurfaceOp("ABSOLUTE_ECHO")).toBe(false);
  });

  it("tap mark-read allowed only for Member A (not chat B / owner C)", () => {
    expect(
      shouldApplyMemberNotificationReadOnPushTap({
        path: "/notifications/n1",
        pipeline: "member_notification_a",
      })
    ).toBe(true);
    expect(
      shouldApplyMemberNotificationReadOnPushTap({
        path: "/community-messenger/rooms/r1",
        pipeline: "conversation_b",
      })
    ).toBe(false);
    expect(
      shouldApplyMemberNotificationReadOnPushTap({
        path: "/owner/stores/s1/orders/o1",
        recipientScope: "store",
      })
    ).toBe(false);
    expect(
      shouldApplyMemberNotificationReadOnPushTap({
        path: "/community-messenger/rooms/r1",
      })
    ).toBe(false);
  });

  it("FCM envelope carries recipientScope + absolute badge echo (not invent)", () => {
    const fields = buildFcmDataFields(
      {
        user_id: "u1",
        notification_type: "system",
        title: "t",
        body: "b",
        link_url: "/notifications/n1",
        link_url_absolute: null,
        occurred_at: "2026-08-03T00:00:00.000Z",
        meta: { kind: "admin_notice", notification_event_id: "evt-1" },
      },
      { badge_count: 4, notification_event_id: "evt-1" },
      { tag: "evt-1" }
    );
    expect(fields.recipientScope).toBe("member");
    expect(fields.pipeline).toBe("member_notification_a");
    expect(fields.eventId).toBe("evt-1");
    expect(fields.badgeCount).toBe("4");
    expect(fields.targetRoute).toContain("/notifications");
  });

  it("chat FCM envelope is conversation_b and does not allow A read-on-tap", () => {
    const fields: Record<string, unknown> = {
      type: "chat_message",
      url: "/community-messenger/rooms/r1",
      roomId: "r1",
      badgeCount: "3",
      notificationId: "chat-evt",
    };
    applyPushTransportEnvelope(fields, {
      type: "chat_message",
      path: "/community-messenger/rooms/r1",
      roomId: "r1",
      userId: "u1",
      eventId: "chat-evt",
    });
    expect(fields.pipeline).toBe("conversation_b");
    expect(fields.recipientScope).toBe("member");
    expect(
      shouldApplyMemberNotificationReadOnPushTap({
        path: String(fields.targetRoute),
        pipeline: String(fields.pipeline),
      })
    ).toBe(false);
  });

  it("dispatcher resolves badge via MemberAppIconTotal echo only", () => {
    const src = fs.readFileSync(
      path.join(root, "lib/notifications/pipeline/notify-push-dispatcher.ts"),
      "utf8"
    );
    expect(src).toContain("resolveMemberAppIconTotalForNativeFcm");
    expect(src).toContain("fetchDomainBadgeAuthorityPayload");
    expect(src).not.toMatch(/badgeCount\s*\+\s*1/);
    expect(src).not.toMatch(/badge_count\s*\+\s*1/);
    expect(
      resolveMemberAppIconTotalForNativeFcm({
        memberAppIconWebTotal: 5,
        appIconTotal: 99,
      })
    ).toBe(5);
  });

  it("static: PushRouteListener does not invent Bell/Bottom/App Icon; uses A gate", () => {
    const src = fs.readFileSync(
      path.join(root, "components/push/PushRouteListener.tsx"),
      "utf8"
    );
    expect(src).toContain("shouldApplyMemberNotificationReadOnPushTap");
    expect(src).not.toContain("setBadgeCount(");
    expect(src).not.toContain("syncNativeBadgeCount");
    expect(src).not.toContain("requestNotificationBadgeCountResync");
    expect(src).not.toMatch(/badgeCount\s*\+/);
    expect(src).not.toContain("getNotificationBadgeCountSnapshot");
  });

  it("static: Native FCM service does not setNumber(badgeCount) on domain children", () => {
    const fcm = fs.readFileSync(
      path.join(root, "android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java"),
      "utf8"
    );
    expect(fcm).toContain("setNumber(0)");
    expect(fcm).not.toContain("setNumber(badgeCount)");
    expect(fcm).not.toMatch(/badgeCount\s*\+\s*1/);
    expect(fcm).toContain("onDomainNotificationPosted");
  });

  it("static: Cap Badge.set / Delivery only via syncNativeBadgeCount after Projection", () => {
    const sync = fs.readFileSync(
      path.join(root, "lib/push/native/sync-native-badge-count.ts"),
      "utf8"
    );
    expect(sync).toContain("absolute");
    expect(sync).toContain("Badge.set");
    const nativeSync = fs.readFileSync(
      path.join(root, "components/push/NativeBadgeSync.tsx"),
      "utf8"
    );
    expect(nativeSync).toContain("subscribeDomainBadgeSurface");
    expect(nativeSync).toContain("surface.appIconTotal");
  });
});
