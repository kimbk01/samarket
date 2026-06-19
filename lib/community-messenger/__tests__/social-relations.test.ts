import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isMutualFriend } from "@/lib/community-messenger/social-relations";

const root = join(process.cwd());

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("me relations hidden SSOT contract", () => {
  it("hidden list route uses user_relationships not user_hides", () => {
    const src = read("app/api/me/relations/[type]/route.ts");
    expect(src).toContain("listHiddenUserRelationshipRows");
    expect(src).toContain("removeHiddenUserRelationshipById");
    expect(src).not.toContain("user_hides");
  });
});

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
