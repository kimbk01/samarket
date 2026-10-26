import { describe, expect, it } from "vitest";
import {
  hasCustomUserAvatar,
  isLikelyUserUploadedAvatarUrl,
  normalizeProfileAvatarUrlForDb,
  resolveUserAvatarImageSrc,
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

  it("resolves custom storage avatar to a display src (thumb or original)", () => {
    const ok =
      "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/578af885-075a-4252-b53b-dc321c4fb68b/profile/5438fa2a-2cdb-41da-81d7-1a60eb20fe47.jpg";
    const out = resolveUserAvatarImageSrc(ok);
    expect(out).toBeTruthy();
    expect(out).toContain("/storage/v1/object/public/post-images/");
  });
});
