import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hydrateNotificationSoundSnapshotFromRows,
  invalidateNotificationSoundSsotCache,
  resolveNotificationSoundForEvent,
} from "@/lib/notifications/notification-sound-resolver";
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

async function seedAdminMappings(
  entries: Array<{ eventKey: string; assetId: string; androidChannel: string }>
): Promise<void> {
  await hydrateNotificationSoundSnapshotFromRows({
    assets: entries.map(({ eventKey, assetId, androidChannel }) => ({
      id: assetId,
      label: `${eventKey}.mp3`,
      kind: "dibay_custom" as const,
      domain: "community" as const,
      file_path: null,
      file_url: `https://cdn.example.com/${eventKey}.mp3`,
      ios_sound_name: `${eventKey}.wav`,
      android_channel_base: androidChannel,
      legacy_source: null,
      enabled: true,
    })),
    events: [],
    mappings: entries.map(({ eventKey, assetId }) => ({
      event_key: eventKey,
      asset_id: assetId,
      use_device_default: false,
      volume: 1,
      repeat_count: 1,
      cooldown_seconds: 0,
      vibration_enabled: null,
      priority: null,
      enabled: true,
    })),
  });
}

describe("push-sound-ssot-enrichment", () => {
  beforeEach(() => {
    invalidateNotificationSoundSsotCache();
  });

  afterEach(() => {
    invalidateNotificationSoundSsotCache();
  });

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

  it("resolves community like/comment/mention with distinct admin mapping assets", async () => {
    await seedAdminMappings([
      { eventKey: "community_like_received", assetId: "ADMIN-LIKE-99", androidChannel: "dibay_community_like_v1" },
      {
        eventKey: "community_comment_received",
        assetId: "ADMIN-COMMENT-99",
        androidChannel: "dibay_community_comment_v1",
      },
      {
        eventKey: "community_mention_received",
        assetId: "ADMIN-MENTION-99",
        androidChannel: "dibay_community_mention_v1",
      },
    ]);

    const likeOut = baseOut({
      notification_type: "report",
      meta: { kind: "community_like", push_kind: "community" },
    });
    expect(resolveEventKeyForPushDispatch(likeOut)).toBe("community_like_received");
    expect(resolveEventKeyForPushDispatch(likeOut)).not.toBe("messenger_direct_message_received");
    const likeEnriched = enrichPushPayloadWithSoundSsotMeta(likeOut);
    expect(likeEnriched.meta?.sound_asset_id).toBe("ADMIN-LIKE-99");
    expect(resolveNotificationSoundForEvent("community_like_received").resolvedFrom).toBe("admin_mapping");

    const commentOut = baseOut({
      notification_type: "report",
      meta: { kind: "community_comment", push_kind: "community" },
    });
    expect(resolveEventKeyForPushDispatch(commentOut)).toBe("community_comment_received");
    const commentEnriched = enrichPushPayloadWithSoundSsotMeta(commentOut);
    expect(commentEnriched.meta?.sound_asset_id).toBe("ADMIN-COMMENT-99");

    const mentionOut = baseOut({
      notification_type: "chat",
      meta: { kind: "mention_message", room_id: "room-1" },
    });
    expect(resolveEventKeyForPushDispatch(mentionOut)).toBe("community_mention_received");
    const mentionEnriched = enrichPushPayloadWithSoundSsotMeta(mentionOut);
    expect(mentionEnriched.meta?.sound_asset_id).toBe("ADMIN-MENTION-99");
  });

  it("maps delivery owner new order and settlement charge with admin mapping (not delivery chat default)", async () => {
    await seedAdminMappings([
      {
        eventKey: "delivery_order_created_owner",
        assetId: "ADMIN-OWNER-ORDER-99",
        androidChannel: "dibay_delivery_owner_v1",
      },
      {
        eventKey: "settlement_charge_approved",
        assetId: "ADMIN-CHARGE-OK-99",
        androidChannel: "dibay_settlement_v1",
      },
      {
        eventKey: "settlement_balance_low",
        assetId: "ADMIN-BALANCE-LOW-99",
        androidChannel: "dibay_settlement_v1",
      },
    ]);

    const ownerOrderOut = baseOut({
      notification_type: "commerce",
      meta: { kind: "store_order_created", order_id: "ord-1" },
    });
    expect(resolveEventKeyForPushDispatch(ownerOrderOut)).toBe("delivery_order_created_owner");
    expect(resolveEventKeyForPushDispatch(ownerOrderOut)).not.toBe("delivery_chat_message_received_owner");
    const ownerEnriched = enrichPushPayloadWithSoundSsotMeta(ownerOrderOut);
    expect(ownerEnriched.meta?.sound_asset_id).toBe("ADMIN-OWNER-ORDER-99");
    expect(resolveNotificationSoundForEvent("delivery_order_created_owner").resolvedFrom).toBe("admin_mapping");

    const chargeOut = baseOut({
      notification_type: "commerce",
      meta: { kind: "store_point_charge_approved", store_id: "s1" },
    });
    expect(resolveEventKeyForPushDispatch(chargeOut)).toBe("settlement_charge_approved");
    const chargeEnriched = enrichPushPayloadWithSoundSsotMeta(chargeOut);
    expect(chargeEnriched.meta?.sound_asset_id).toBe("ADMIN-CHARGE-OK-99");
    expect(chargeEnriched.meta?.sound_asset_id).not.toBe(
      resolveNotificationSoundForEvent("delivery_chat_message_received_owner").assetId
    );

    const balanceOut = baseOut({
      notification_type: "commerce",
      meta: { kind: "store_point_low", store_id: "s1" },
    });
    expect(resolveEventKeyForPushDispatch(balanceOut)).toBe("settlement_balance_low");
    const balanceEnriched = enrichPushPayloadWithSoundSsotMeta(balanceOut);
    expect(balanceEnriched.meta?.sound_asset_id).toBe("ADMIN-BALANCE-LOW-99");
  });

  it("enriches incoming voice call push with admin SSOT mapping", async () => {
    await seedAdminMappings([
      {
        eventKey: "call_incoming_voice",
        assetId: "ADMIN-CALL-VOICE-99",
        androidChannel: "dibay_calls_incoming_v7",
      },
      {
        eventKey: "call_missed",
        assetId: "ADMIN-CALL-MISSED-99",
        androidChannel: "dibay_calls_incoming_v7",
      },
    ]);

    const incomingOut = baseOut({
      notification_type: "community_messenger_incoming_call",
      meta: { session_id: "sess-in", kind: "voice" },
    });
    const incomingEnriched = enrichPushPayloadWithSoundSsotMeta(incomingOut, {
      event_type: "call_ringing",
      call_push_kind: "incoming_call",
    });
    expect(incomingEnriched.meta?.event_key).toBe("call_incoming_voice");
    expect(incomingEnriched.meta?.sound_asset_id).toBe("ADMIN-CALL-VOICE-99");
    expect(incomingEnriched.meta?.ringtone_policy).toBe("custom");
    expect(resolveNotificationSoundForEvent("call_incoming_voice").resolvedFrom).toBe("admin_mapping");

    const missedOut = baseOut({
      notification_type: "community_messenger_missed_call",
      meta: { session_id: "sess-m2" },
    });
    const missedEnriched = enrichPushPayloadWithSoundSsotMeta(missedOut, {
      call_push_kind: "missed_call",
    });
    expect(missedEnriched.meta?.event_key).toBe("call_missed");
    expect(missedEnriched.meta?.sound_asset_id).toBe("ADMIN-CALL-MISSED-99");
  });

  it("incoming call disabled mapping → ringtone_policy silent without url", async () => {
    await hydrateNotificationSoundSnapshotFromRows({
      assets: [
        {
          id: "ADMIN-CALL-OFF",
          label: "off",
          kind: "dibay_custom",
          domain: "call_voice",
          file_path: null,
          file_url: "https://cdn.example.com/off.mp3",
          ios_sound_name: null,
          android_channel_base: "dibay_calls_incoming_v7",
          legacy_source: null,
          enabled: true,
        },
      ],
      events: [],
      mappings: [
        {
          event_key: "call_incoming_voice",
          asset_id: "ADMIN-CALL-OFF",
          use_device_default: false,
          volume: 1,
          repeat_count: 1,
          cooldown_seconds: 0,
          vibration_enabled: null,
          priority: null,
          enabled: false,
        },
      ],
    });

    const incomingOut = baseOut({
      notification_type: "community_messenger_incoming_call",
      meta: { session_id: "sess-silent", kind: "voice" },
    });
    const enriched = enrichPushPayloadWithSoundSsotMeta(incomingOut, {
      event_type: "call_ringing",
      call_push_kind: "incoming_call",
    });
    expect(enriched.meta?.ringtone_policy).toBe("silent");
    expect(enriched.meta?.ringtone_url).toBeUndefined();

    const fields = buildFcmDataFields(enriched, { call_push_kind: "incoming_call" }, {});
    expect(fields.ringtone_policy).toBe("silent");
    expect(fields.ringtoneUrl).toBeUndefined();
  });

  it("maps call rejected and canceled push to SSOT event keys", () => {
    const rejectedOut = baseOut({
      notification_type: "community_messenger_call_canceled",
      meta: { session_id: "sess-r" },
    });
    expect(
      resolveEventKeyForPushDispatch(rejectedOut, { call_push_kind: "call_rejected" })
    ).toBe("call_rejected");

    const canceledOut = baseOut({
      notification_type: "community_messenger_call_canceled",
      meta: { session_id: "sess-c" },
    });
    expect(
      resolveEventKeyForPushDispatch(canceledOut, { call_push_kind: "call_canceled" })
    ).toBe("call_ended");
  });
});
