import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("gift transfer offer route domain gate", () => {
  it("blocks non-general-direct rooms before calling the transfer RPC", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/api/me/gift-certificates/transfers/offer/route.ts"),
      "utf8"
    );

    expect(source).toContain('error: "not_general_direct"');
    expect(source).toContain("isMessengerGeneralFriendDirectKey");
    expect(source.indexOf('error: "not_general_direct"')).toBeLessThan(
      source.indexOf("await executeGiftTransferOffer")
    );
  });
});
