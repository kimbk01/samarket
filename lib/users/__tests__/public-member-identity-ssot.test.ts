/**
 * MEMBER / STORE identity SSOT — regression + HARD LOCK.
 * Contaminated display_name / username must never become Member display.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  memberCompactLabelFromRow,
  memberDisplayLabelFromRow,
  resolvePublicMemberIdentity,
} from "@/lib/users/public-member-identity";
import { resolvePublicStoreIdentity } from "@/lib/stores/public-store-identity";
import { mapProfileRowToPublicSeller } from "@/lib/users/map-profile-to-public-seller";
import { formatAdminMemberLabel } from "@/lib/admin-community/member-identity";

const CONTAMINATED = {
  id: "user-asas22",
  nickname: "선양소주",
  display_name: "CRYSTAL CLEAR",
  username: "asas22",
  dibay_id: "asas22",
  avatar_url: null,
};

const COMMUNITY_CONTAMINATED = {
  id: "user-asas11",
  nickname: "참이슬",
  display_name: "JTV KOREAN MART",
  username: "asas11",
  dibay_id: "asas11",
};

describe("public-member-identity SSOT", () => {
  it("A contaminated display_name → Member display = nickname", () => {
    const id = resolvePublicMemberIdentity(CONTAMINATED);
    expect(id?.displayLabel).toBe("선양소주");
    expect(id?.handleLabel).toBe("@asas22");
    expect(id?.compactLabel).toBe("선양소주 (@asas22)");
    expect(memberDisplayLabelFromRow(CONTAMINATED)).toBe("선양소주");
    expect(memberCompactLabelFromRow(CONTAMINATED)).toBe("선양소주 (@asas22)");
  });

  it("Community contaminated display_name → 참이슬", () => {
    expect(memberDisplayLabelFromRow(COMMUNITY_CONTAMINATED)).toBe("참이슬");
  });

  it("B Store identity isolated from Member fields", () => {
    const store = resolvePublicStoreIdentity({
      id: "store-1",
      store_name: "CRYSTAL CLEAR",
      slug: "asas22",
    });
    expect(store?.storeName).toBe("CRYSTAL CLEAR");
    expect(store?.slug).toBe("asas22");
    const member = resolvePublicMemberIdentity(CONTAMINATED);
    expect(member?.displayLabel).toBe("선양소주");
    expect(member?.displayLabel).not.toBe(store?.storeName);
  });

  it("C trade seller DTO list/detail source = nickname + dibay_id", () => {
    const seller = mapProfileRowToPublicSeller({
      ...CONTAMINATED,
      trust_score: 50,
    });
    expect(seller.nickname).toBe("선양소주");
    expect(seller.display_name).toBe("선양소주");
    expect(seller.username).toBe("asas22");
  });

  it("nickname null → @dibay_id, never display_name", () => {
    const id = resolvePublicMemberIdentity({
      id: "u1",
      nickname: null,
      dibay_id: "asas99",
      display_name: "SHOULD_NOT_USE",
      username: "SHOULD_NOT_USE",
    } as never);
    expect(id?.displayLabel).toBe("@asas99");
  });

  it("admin community label uses nickname | dibay_id", () => {
    expect(
      formatAdminMemberLabel({ nickname: "선양소주", username: "asas22" })
    ).toBe("선양소주 | asas22");
  });
});

describe("member identity HARD LOCK (source)", () => {
  const root = process.cwd();

  it("canonical helper never references display_name/username/store_name as authority", () => {
    const src = readFileSync(join(root, "lib/users/public-member-identity.ts"), "utf8");
    expect(src).toMatch(/profiles\.nickname/);
    expect(src).toMatch(/profiles\.dibay_id/);
    // Implementation body must not read display_name / username fields
    const body = src.split("export function resolvePublicMemberIdentity")[1] ?? "";
    expect(body).not.toMatch(/display_name/);
    expect(body).not.toMatch(/\.username/);
    expect(body).not.toMatch(/store_name/);
  });

  it("key Member readers do not reintroduce display_name || nickname", () => {
    const files = [
      "lib/chats/resolve-author-nickname.ts",
      "lib/posts/enrich-posts-author-nicknames.ts",
      "lib/stores/buyer-public-label.ts",
      "lib/users/map-profile-to-public-seller.ts",
      "lib/chats/fetch-partner-display.ts",
      "lib/promotion/community-paid-exposure-feed.ts",
      "lib/admin-community/member-identity.ts",
      "app/api/me/relations/[type]/route.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, rel).not.toMatch(/display_name\s*\|\|\s*nickname/);
      expect(src, rel).not.toMatch(/display_name\s*\?\?\s*nickname/);
      expect(src, rel).toMatch(/public-member-identity|MEMBER_IDENTITY/);
    }
  });

  it("profile PATCH writes nickname as canonical (bridge display_name OK)", () => {
    const src = readFileSync(join(root, "app/api/me/profile/route.ts"), "utf8");
    expect(src).toMatch(/patch\.nickname\s*=\s*nicknameFromBody/);
    expect(src).toMatch(/MEMBER DISPLAY SSOT/);
  });
});
