import { describe, expect, it } from "vitest";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";
import {
  enrichPushPayloadWithSoundSsotMeta,
  resolveEventKeyForPushDispatch,
} from "@/lib/push/dispatch/push-sound-ssot-enrichment";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

function baseOut(
  partial: Partial<NotificationSideEffectPayloadOut> & Pick<NotificationSideEffectPayloadOut, "notification_type">
): NotificationSideEffectPayloadOut {
  return {
    user_id: "user-1",
    title: "Title",
    body: "Body",
    link_url: "/",
    link_url_absolute: "https://example.com/",
    occurred_at: "2026-06-15T00:00:00.000Z",
    ...partial,
  };
}

describe("push-sound-ssot-enrichment", () => {
  it("skips when meta.event_key already present", () => {
    const out = baseOut({
      notification_type: "chat",
      meta: {
        event_key: "trade_chat_message_received",
        sound_asset_id: "SND-010",
        android_channel_id: "dibay_trade_v1",
        ios_sound_name: "trade.wav",
      },
    });
    const enriched = enrichPushPayloadWithSoundSsotMeta(out);
    expect(enriched).toBe(out);
  });

  it("enriches incoming video call push from call_ringing + meta.kind", () => {
    const out = baseOut({
      notification_type: "community_messenger_incoming_call",
      meta: { session_id: "sess-1", kind: "video" },
    });
    const enriched = enrichPushPayloadWithSoundSsotMeta(out, {
      event_type: "call_ringing",
      call_push_kind: "incoming_call",
    });
    expect(enriched.meta).toMatchObject({
      event_key: "call_incoming_video",
      sound_asset_id: expect.any(String),
      android_channel_id: expect.any(String),
    });
    const fields = buildFcmDataFields(enriched, { call_push_kind: "incoming_call" }, {});
    expect(fields.eventKey).toBe("call_incoming_video");
    expect(fields.androidChannelId).toBeTruthy();
    expect(fields.soundAssetId).toBeTruthy();
  });

  it("enriches missed call push", () => {
    const out = baseOut({
      notification_type: "community_messenger_missed_call",
      meta: { session_id: "sess-m" },
    });
    const enriched = enrichPushPayloadWithSoundSsotMeta(out, {
      event_type: "missed_call",
      call_push_kind: "missed_call",
    });
    expect(resolveEventKeyForPushDispatch(out, { call_push_kind: "missed_call" })).toBe("call_missed");
    expect(enriched.meta?.event_key).toBe("call_missed");
  });

  it("enriches admin campaign marketing push from meta.kind", () => {
    const out = baseOut({
      notification_type: "marketing",
      meta: {
        kind: "admin_marketing_banner",
        category: "admin_marketing_banner",
        campaign_id: "camp-1",
      },
    });
    const enriched = enrichPushPayloadWithSoundSsotMeta(out, { target_type: "admin_campaign" });
    expect(enriched.meta?.event_key).toBe("admin_notice_received");
    expect(enriched.meta?.android_channel_id).toBe("dibay_admin_notice_v1");
  });

  it("enriches admin push test via admin_test notification_type", () => {
    const out = baseOut({ notification_type: "admin_test" });
    const enriched = enrichPushPayloadWithSoundSsotMeta(out, { event_type: "admin_test" });
    expect(enriched.meta?.event_key).toBe("admin_notice_received");
  });

  it("honors explicit opts.event_key override", () => {
    const out = baseOut({ notification_type: "chat" });
    const enriched = enrichPushPayloadWithSoundSsotMeta(out, {
      event_key: "messenger_direct_message_received",
    });
    expect(enriched.meta?.event_key).toBe("messenger_direct_message_received");
    expect(enriched.meta?.android_channel_id).toBe("dibay_chat_messages_v1");
  });

  it("maps legacy meta.push_kind trade to trade SSOT key", () => {
    const out = baseOut({
      notification_type: "status",
      meta: { push_kind: "trade" },
    });
    expect(resolveEventKeyForPushDispatch(out)).toBe("trade_offer_received");
  });
});
