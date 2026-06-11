import { describe, expect, it } from "vitest";
import {
  hasCustomUserAvatar,
  isLikelyUserUploadedAvatarUrl,
  normalizeProfileAvatarUrlForDb,
} from "@/lib/profile/user-avatar-display";
import { SAMARKET_DEFAULT_AVATAR_URL } from "@/lib/profile/default-avatar";

describe("user-avatar-display", () => {
  it("detects supabase storage uploads", () => {
    expect(
      isLikelyUserUploadedAvatarUrl(
        "https://abc.supabase.co/storage/v1/object/public/avatars/user.png"
      )
    ).toBe(true);
  });

  it("treats default SVG as non-custom", () => {
    expect(hasCustomUserAvatar(SAMARKET_DEFAULT_AVATAR_URL)).toBe(false);
  });

  it("normalizes empty avatar to default SVG for DB", () => {
    expect(normalizeProfileAvatarUrlForDb(null)).toBe(SAMARKET_DEFAULT_AVATAR_URL);
    expect(normalizeProfileAvatarUrlForDb("")).toBe(SAMARKET_DEFAULT_AVATAR_URL);
  });
});
