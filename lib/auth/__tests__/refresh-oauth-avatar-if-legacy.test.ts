import { describe, expect, it } from "vitest";
import {
  buildOAuthAvatarPatch,
  mergeOAuthAvatarIntoPatch,
  resolveOAuthAvatarForProfile,
  shouldRefreshAvatarFromOAuth,
} from "@/lib/auth/refresh-oauth-avatar-if-legacy";
import { SAMARKET_DEFAULT_AVATAR_URL } from "@/lib/profile/default-avatar";

describe("refresh-oauth-avatar-if-legacy", () => {
  it("fills empty avatar from OAuth", () => {
    expect(
      shouldRefreshAvatarFromOAuth({ onboarding_completed_at: null, avatar_url: null }, "https://img.example/a.png")
    ).toBe(true);
    expect(
      buildOAuthAvatarPatch({ onboarding_completed_at: null, avatar_url: null }, { avatarCandidate: "https://img.example/a.png" })
    ).toEqual({ avatar_url: "https://img.example/a.png" });
  });

  it("replaces default SVG with OAuth photo", () => {
    expect(
      shouldRefreshAvatarFromOAuth(
        { onboarding_completed_at: null, avatar_url: SAMARKET_DEFAULT_AVATAR_URL },
        "https://lh3.googleusercontent.com/a/abc"
      )
    ).toBe(true);
  });

  it("re-syncs OAuth CDN URL during incomplete signup", () => {
    expect(
      shouldRefreshAvatarFromOAuth(
        {
          onboarding_completed_at: null,
          avatar_url: "https://lh3.googleusercontent.com/a/stale",
        },
        "https://lh3.googleusercontent.com/a/fresh"
      )
    ).toBe(true);
  });

  it("skips overwrite when signup complete and custom upload exists", () => {
    expect(
      shouldRefreshAvatarFromOAuth(
        {
          onboarding_completed_at: "2026-01-01T00:00:00Z",
          avatar_url: "https://example.supabase.co/storage/v1/object/public/avatars/me.png",
        },
        "https://lh3.googleusercontent.com/a/new"
      )
    ).toBe(false);
  });

  it("skips overwrite of user upload during incomplete signup", () => {
    expect(
      shouldRefreshAvatarFromOAuth(
        {
          onboarding_completed_at: null,
          avatar_url: "https://example.supabase.co/storage/v1/object/public/avatars/me.png",
        },
        "https://lh3.googleusercontent.com/a/new"
      )
    ).toBe(false);
  });

  it("does not refresh when OAuth candidate is missing", () => {
    expect(
      shouldRefreshAvatarFromOAuth(
        { onboarding_completed_at: null, avatar_url: SAMARKET_DEFAULT_AVATAR_URL },
        null
      )
    ).toBe(false);
  });

  it("mergeOAuthAvatarIntoPatch sets default SVG when avatar empty and no OAuth photo", () => {
    const patch: Record<string, unknown> = {};
    mergeOAuthAvatarIntoPatch(
      patch,
      { onboarding_completed_at: null, avatar_url: null },
      { avatarCandidate: null }
    );
    expect(patch.avatar_url).toBe(SAMARKET_DEFAULT_AVATAR_URL);
  });

  it("falls back to dibay default when no OAuth photo", () => {
    expect(
      resolveOAuthAvatarForProfile({ onboarding_completed_at: null, avatar_url: null }, { avatarCandidate: null })
    ).toBe(SAMARKET_DEFAULT_AVATAR_URL);
  });
});
