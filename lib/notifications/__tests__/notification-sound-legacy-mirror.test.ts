import { describe, expect, it, vi } from "vitest";
import { mappingPatchFromEventKey, mirrorNotificationSoundToLegacy } from "@/lib/notifications/notification-sound-legacy-mirror";

describe("notification-sound-legacy-mirror", () => {
  it("builds mapping patch from event key", () => {
    const p = mappingPatchFromEventKey("trade_chat_message_received", "DIBAY-SND-013");
    expect(p.event_key).toBe("trade_chat_message_received");
    expect(p.asset_id).toBe("DIBAY-SND-013");
    expect(p.enabled).toBe(true);
  });

  it("maps call incoming voice to legacy column contract", () => {
    const p = mappingPatchFromEventKey("call_incoming_voice", "DIBAY-SND-040");
    expect(p.event_key).toBe("call_incoming_voice");
  });

  it("propagates admin_notification_settings upsert errors", async () => {
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "notification_sound_assets") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { file_url: null, file_path: "/sounds/x.wav" } }),
              }),
            }),
          };
        }
        if (table === "admin_notification_settings") {
          return { upsert: async () => ({ error: { message: "write denied" } }) };
        }
        return { upsert: async () => ({ error: null }) };
      }),
    };

    await expect(
      mirrorNotificationSoundToLegacy(sb as never, [
        { event_key: "trade_chat_message_received", asset_id: "DIBAY-SND-013" },
      ])
    ).rejects.toThrow("legacy_mirror_failed:admin_notification_settings:write denied");
  });
});
