import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

/**
 * Leave deletes `community_messenger_participants` while retaining CM room FKs.
 * Re-entry via item_trade start / ensure MUST restore the pair before send,
 * or resolve returns the same messengerRoomId and send fails with room_not_found.
 */
describe("trade leave→reentry CM participant restore contract", () => {
  it("ensureMessengerRoomIdForItemTrade restores participants on aligned FK early return", () => {
    const src = readFileSync(
      join(ROOT, "lib/trade/ensure-messenger-room-for-trade-chat.ts"),
      "utf8"
    );
    expect(src).toContain("ensureCommunityMessengerDirectRoomFromProductChat");
    expect(src).toMatch(
      /storedPc === onCr[\s\S]*?ensureCommunityMessengerDirectRoomFromProductChat\(buyerId/
    );
    expect(src).toMatch(
      /if \(capable\) \{\s*await ensureCommunityMessengerDirectRoomFromProductChat\(buyerId/
    );
  });

  it("existing item_trade fast path does not skip participant restore", () => {
    const src = readFileSync(join(ROOT, "lib/trade/item-trade-chat-start-core.ts"), "utf8");
    expect(src).toContain("messenger_room_existing_fast_path_aligned");
    expect(src).toMatch(
      /messenger_room_existing_fast_path_aligned[\s\S]*?ensureMessengerRoomIdForItemTrade\(/
    );
  });
});
