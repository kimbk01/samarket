import { describe, expect, it } from "vitest";
import {
  buildRegistrySnapshot,
  resolveNotificationSoundFromSnapshot,
} from "@/lib/notifications/notification-sound-resolver";
import { SILENT_ASSET_ID } from "@/lib/notifications/notification-sound-types";

describe("notification-sound-resolver", () => {
  const snapshot = buildRegistrySnapshot();

  it("resolves direct message event", () => {
    const r = resolveNotificationSoundFromSnapshot("messenger_direct_message_received", {}, snapshot);
    expect(r.eventKey).toBe("messenger_direct_message_received");
    expect(r.assetId).toBe("DIBAY-SND-011");
    expect(r.androidChannelId).toBe("dibay_chat_messages_v1");
  });

  it("room mute returns silent", () => {
    const r = resolveNotificationSoundFromSnapshot(
      "messenger_direct_message_received",
      { roomMuted: true },
      snapshot
    );
    expect(r.assetId).toBe(SILENT_ASSET_ID);
    expect(r.enabled).toBe(false);
    expect(r.resolvedFrom).toBe("room_mute");
  });

  it("admin mapping overrides default", () => {
    const snap = buildRegistrySnapshot();
    snap.mappings.set("trade_chat_message_received", {
      event_key: "trade_chat_message_received",
      asset_id: "DIBAY-SND-001",
      use_device_default: false,
      volume: 0.5,
      repeat_count: 2,
      cooldown_seconds: 0,
      vibration_enabled: null,
      priority: null,
      enabled: true,
    });
    const r = resolveNotificationSoundFromSnapshot("trade_chat_message_received", {}, snap);
    expect(r.assetId).toBe("DIBAY-SND-001");
    expect(r.resolvedFrom).toBe("admin_mapping");
    expect(r.volume).toBe(0.5);
  });

  it("throws on unknown event in test env", () => {
    expect(() =>
      resolveNotificationSoundFromSnapshot("totally_unknown_event", {}, snapshot)
    ).toThrow(/unknown eventKey/);
  });

  it("separates delivery user and owner events", () => {
    const user = resolveNotificationSoundFromSnapshot("delivery_order_status_changed_user", {}, snapshot);
    const owner = resolveNotificationSoundFromSnapshot("delivery_order_created_owner", {}, snapshot);
    expect(user.assetId).toBe("DIBAY-SND-020");
    expect(owner.assetId).toBe("DIBAY-SND-030");
  });

  it("separates voice and video incoming", () => {
    const v = resolveNotificationSoundFromSnapshot("call_incoming_voice", {}, snapshot);
    const vid = resolveNotificationSoundFromSnapshot("call_incoming_video", {}, snapshot);
    expect(v.assetId).toBe("DIBAY-SND-040");
    expect(vid.assetId).toBe("DIBAY-SND-041");
  });
});
