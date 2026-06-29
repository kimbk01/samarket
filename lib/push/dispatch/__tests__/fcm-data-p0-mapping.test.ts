import { describe, expect, it } from "vitest";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";
import { resolveNotificationSoundProfile } from "@/lib/notifications/policy/notification-sound-profiles";

describe("fcm data p0 mapping", () => {
  it("includes category, routeUrl, campaignId for admin marketing payload", () => {
    const fields = buildFcmDataFields(
      {
        user_id: "u1",
        notification_type: "marketing",
        title: "promo",
        body: "sale",
        link_url: "/community",
        link_url_absolute: null,
        occurred_at: "2026-01-01T00:00:00.000Z",
        meta: {
          category: "admin_marketing_banner",
          campaign_id: "camp-1",
          display_payload: {
            routeUrl: "/community?from=campaign",
            campaignId: "camp-1",
          },
        },
      },
      { event_type: "admin_marketing_banner" },
      {}
    );

    expect(fields.type).toBe("notification");
    expect(fields.category).toBe("admin_marketing_banner");
    expect(fields.campaignId).toBe("camp-1");
    expect(fields.routeUrl).toBe("/community?from=campaign");
  });

  it("maps p0 categories to SSOT android channels", () => {
    expect(resolveNotificationSoundProfile("chat_message").androidChannelId).toBe("dibay_chat_messages_v1");
    expect(resolveNotificationSoundProfile("trade_status").androidChannelId).toBe("dibay_trade_v1");
    expect(resolveNotificationSoundProfile("order_status").androidChannelId).toBe("dibay_orders_v1");
    expect(resolveNotificationSoundProfile("delivery_status").androidChannelId).toBe("dibay_orders_v1");
    expect(resolveNotificationSoundProfile("community_activity").androidChannelId).toBe("dibay_community_v1");
    expect(resolveNotificationSoundProfile("admin_marketing_banner").androidChannelId).toBe("dibay_admin_notice_v1");
    expect(resolveNotificationSoundProfile("admin_notice").androidChannelId).toBe("dibay_admin_notice_v1");
    expect(resolveNotificationSoundProfile("incoming_call_signal").androidChannelId).toBe("dibay_calls_incoming_v7");
    expect(resolveNotificationSoundProfile("missed_call").androidChannelId).toBe("dibay_calls_missed_v1");
    expect(resolveNotificationSoundProfile("chat_message").eventKey).toBe("messenger_direct_message_received");
  });
});
