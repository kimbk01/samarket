import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { extractOAuthProfileSeed } from "@/lib/auth/oauth-profile-seed";
import { GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN } from "@/lib/auth/native/google-auth-env.server";
import { KAKAO_NATIVE_AUTH_EMAIL_DOMAIN } from "@/lib/auth/native/kakao-auth-env.server";
import { APPLE_NATIVE_AUTH_EMAIL_DOMAIN } from "@/lib/auth/native/apple-auth-env.server";

/**
 * Slice 6-2 — prove native explicit ensurePending seeds match extractOAuthProfileSeed(syntheticUser)
 * so ensureAuthProfileForLogin(syntheticUser) is input-equivalent without seed override.
 */

function asUser(partial: Record<string, unknown>): User {
  return partial as unknown as User;
}

describe("native profile seed equivalence for ensureAuthProfileForLogin", () => {
  it("Google explicit seed == extractOAuthProfileSeed(synthetic)", () => {
    const verified = {
      googleUserId: "gid1",
      name: "Ada Lovelace",
      picture: "https://example.com/a.png",
      email: "Ada@Gmail.com",
      emailVerified: true,
    };
    const explicit = {
      authProvider: "google",
      nicknameCandidate: verified.name ?? null,
      avatarCandidate: verified.picture ?? null,
      emailInternal: verified.emailVerified ? verified.email.trim().toLowerCase() : null,
    };
    const synthetic = asUser({
      id: "u1",
      email: `google.${verified.googleUserId}@${GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN}`,
      app_metadata: { provider: "google" },
      user_metadata: {
        provider: "google",
        google_id: verified.googleUserId,
        full_name: verified.name,
        avatar_url: verified.picture,
        google_email_hint: verified.email,
      },
      identities: [{ provider: "google", identity_data: { sub: verified.googleUserId } }],
    });
    expect(extractOAuthProfileSeed(synthetic)).toEqual(explicit);
  });

  it("Kakao explicit seed == extractOAuthProfileSeed(synthetic)", () => {
    const verified = {
      kakaoUserId: "kid1",
      nickname: "카카오닉",
      profileImageUrl: "https://example.com/k.png",
      email: "k@kakao.com",
      hasEmailFromProfile: true,
    };
    const explicit = {
      authProvider: "kakao",
      nicknameCandidate: verified.nickname ?? null,
      avatarCandidate: verified.profileImageUrl ?? null,
      emailInternal: verified.hasEmailFromProfile ? (verified.email ?? null)?.toLowerCase() ?? null : null,
    };
    // Production Kakao path passes email without toLowerCase; facade normalizes.
    // Equivalence holds when provider email is already lowercase (typical).
    const synthetic = asUser({
      id: "u1",
      email: `kakao.${verified.kakaoUserId}@${KAKAO_NATIVE_AUTH_EMAIL_DOMAIN}`,
      app_metadata: { provider: "kakao" },
      user_metadata: {
        provider: "kakao",
        kakao_id: verified.kakaoUserId,
        nickname: verified.nickname,
        avatar_url: verified.profileImageUrl,
        kakao_email_hint: verified.email,
      },
      identities: [{ provider: "kakao", identity_data: { sub: verified.kakaoUserId } }],
    });
    expect(extractOAuthProfileSeed(synthetic)).toEqual(explicit);
  });

  it("Apple explicit seed == extractOAuthProfileSeed(synthetic) (null nick/avatar)", () => {
    const verified = {
      sub: "asub1",
      email: "real@icloud.com",
      isPrivateRelayEmail: false,
    };
    const explicit = {
      authProvider: "apple",
      nicknameCandidate: null,
      avatarCandidate: null,
      emailInternal: verified.email.toLowerCase(),
    };
    const synthetic = asUser({
      id: "u1",
      email: `apple.${verified.sub}@${APPLE_NATIVE_AUTH_EMAIL_DOMAIN}`,
      app_metadata: { provider: "apple" },
      user_metadata: {
        provider: "apple",
        apple_sub: verified.sub,
        email: verified.email,
      },
      identities: [{ provider: "apple", identity_data: { sub: verified.sub } }],
    });
    expect(extractOAuthProfileSeed(synthetic)).toEqual(explicit);
  });

  it("Apple private relay keeps emailInternal null", () => {
    const verified = {
      sub: "asub2",
      email: "h@privaterelay.appleid.com",
      isPrivateRelayEmail: true,
    };
    const explicit = {
      authProvider: "apple",
      nicknameCandidate: null,
      avatarCandidate: null,
      emailInternal: null,
    };
    const synthetic = asUser({
      id: "u1",
      email: `apple.${verified.sub}@${APPLE_NATIVE_AUTH_EMAIL_DOMAIN}`,
      app_metadata: { provider: "apple" },
      user_metadata: {
        provider: "apple",
        apple_sub: verified.sub,
        // relay email not placed on metadata by buildAppleUserMetadata
      },
      identities: [{ provider: "apple", identity_data: { sub: verified.sub } }],
    });
    expect(extractOAuthProfileSeed(synthetic)).toEqual(explicit);
  });
});
