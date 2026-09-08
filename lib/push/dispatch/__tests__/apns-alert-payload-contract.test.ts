import { describe, expect, it } from "vitest";
import { buildApnsAlertBody } from "@/lib/push/dispatch/apns-sender-impl";
import { buildWebPushJsonPayload } from "@/lib/push/dispatch/build-web-push-json-payload";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

function out(partial: Partial<NotificationSideEffectPayloadOut>): NotificationSideEffectPayloadOut {
  return {
    user_id: "user-1",
    notification_type: "chat",
    title: "Title",
    body: "Body",
    link_url: "/community-messenger/rooms/room-1",
    link_url_absolute: null,
    occurred_at: "2026-06-22T00:00:00.000Z",
    meta: null,
    ...partial,
  };
}

describe("APNS alert payload contract", () => {
  it("includes badge count, category, and route data for iOS notification tap restore", () => {
    const payload = buildWebPushJsonPayload(
      out({
        notification_type: "marketing",
        link_url: "/community?from=campaign",
        meta: {
          category: "admin_marketing_banner",
          campaign_id: "camp-1",
          badge_count: 7,
          display_payload: {
            routeUrl: "/community?from=campaign",
            campaignId: "camp-1",
          },
        },
      }),
      { event_type: "admin_marketing_banner", badge_count: 7, notification_event_id: "evt-admin-1" }
    );

    const body = buildApnsAlertBody({
      title: "Promo",
      body: "Sale",
      data: payload.data,
    });

    expect(body.aps).toMatchObject({
      alert: { title: "Promo", body: "Sale" },
      badge: 7,
      category: "admin_marketing_banner",
      sound: "default",
    });
    expect(body.routeUrl).toBe("/community?from=campaign");
    expect(body.campaignId).toBe("camp-1");
    expect(body.notificationEventId).toBe("evt-admin-1");
  });

  it("sets mutable-content inside aps when https push image is present", () => {
    const body = buildApnsAlertBody({
      title: "Promo",
      body: "Sale",
      data: { imageUrl: "https://cdn.example/push.jpg" },
    });
    const aps = body.aps as Record<string, unknown>;
    expect(aps.alert).toEqual({ title: "Promo", body: "Sale" });
    expect(aps["mutable-content"]).toBe(1);
    expect(body["mutable-content"]).toBeUndefined();
    expect(body.imageUrl).toBe("https://cdn.example/push.jpg");
    expect(body.push_image_url).toBe("https://cdn.example/push.jpg");
  });

  it("does not force mutable-content on text-only alert", () => {
    const body = buildApnsAlertBody({
      title: "DIBAY D7 TEXT",
      body: "APNs text runtime probe",
      data: { routeUrl: "/notifications" },
    });
    const aps = body.aps as Record<string, unknown>;
    expect(aps.alert).toEqual({ title: "DIBAY D7 TEXT", body: "APNs text runtime probe" });
    expect(aps.sound).toBe("default");
    expect(aps["mutable-content"]).toBeUndefined();
    expect(body.imageUrl).toBeUndefined();
    expect(body.push_image_url).toBeUndefined();
  });

  it("keeps incoming call off normal APNS alert and missed call on alert badge route", () => {
    const missed = buildWebPushJsonPayload(
      out({
        notification_type: "community_messenger_missed_call",
        link_url: "/community-messenger/calls/logs?callId=sess-1",
        meta: {
          session_id: "sess-1",
          room_id: "room-1",
          category: "missed_call",
          badge_count: 3,
        },
      }),
      { call_push_kind: "missed_call", event_type: "missed_call", badge_count: 3 }
    );

    const body = buildApnsAlertBody({ title: "Missed", body: "Call", data: missed.data });
    expect(body.aps).toMatchObject({ badge: 3, category: "missed_call" });
    expect(body.url).toBe("/community-messenger/rooms/room-1?focus=call-history&callId=sess-1");
    expect(missed.data.call_push_kind).toBe("missed_call");
  });
});
