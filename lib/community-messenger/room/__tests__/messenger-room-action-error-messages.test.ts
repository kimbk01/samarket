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

  it("maps moim room codes to moim_err_* keys (moim R3 U-14)", () => {
    for (const code of [
      "moim_room_membership_managed_by_moim",
      "moim_room_settings_managed_by_moim",
      "moim_room_owner_immutable",
      "moim_room_create_requires_moim",
    ]) {
      expect(getMessengerRoomActionErrorMessage(code, t)).toBe(`tr:moim_err_${code}`);
    }
  });
});
