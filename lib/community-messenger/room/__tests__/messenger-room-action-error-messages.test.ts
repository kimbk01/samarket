import { describe, expect, it } from "vitest";
import { getMessengerRoomActionErrorMessage } from "@/lib/community-messenger/room/messenger-room-action-error-messages";

const t = (key: string) => `tr:${key}`;

describe("getMessengerRoomActionErrorMessage", () => {
  it("maps sticker and composer errors", () => {
    expect(getMessengerRoomActionErrorMessage("sticker_asset_invalid", t)).toBe(
      "tr:cm_ui_sticker_assets_missing"
    );
    expect(getMessengerRoomActionErrorMessage("composer_busy", t)).toBe("tr:nav_messenger_action_failed");
  });

  it("maps phone verification required", () => {
    expect(getMessengerRoomActionErrorMessage("PHONE_VERIFICATION_REQUIRED", t)).toBe(
      "tr:auth_phone_gate_unverified_title"
    );
  });
});
