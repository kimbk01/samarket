import { describe, expect, it } from "vitest";
import { isMutualFriend } from "@/lib/community-messenger/social-relations";

describe("isMutualFriend (contract)", () => {
  it("is exported for approval-based friend checks", () => {
    expect(typeof isMutualFriend).toBe("function");
  });
});

describe("resolveMessengerPeerSocialCta", () => {
  it("friend label only when isFriend is mutual", async () => {
    const { resolveMessengerPeerSocialCta } = await import(
      "@/lib/community-messenger/messenger-friend-add-cta"
    );
    expect(
      resolveMessengerPeerSocialCta({ id: "u1", isFriend: true, blocked: false })
    ).toEqual({ kind: "friend" });
    expect(
      resolveMessengerPeerSocialCta({ id: "u1", isFriend: false, blocked: false })
    ).toEqual({ kind: "add_friend" });
  });
});
