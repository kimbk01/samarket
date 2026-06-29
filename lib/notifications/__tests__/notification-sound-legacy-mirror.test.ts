import { describe, expect, it } from "vitest";
import { mappingPatchFromEventKey } from "@/lib/notifications/notification-sound-legacy-mirror";

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
});
