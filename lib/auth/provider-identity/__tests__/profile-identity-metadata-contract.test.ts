/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { extractOAuthProfileSeed } from "@/lib/auth/oauth-profile-seed";
import {
  SOCIAL_IDENTITY_SSOT_TABLE,
  isForbiddenSocialProviderUserId,
  PROFILE_IDENTITY_COLUMN_ROLES,
} from "@/lib/auth/provider-identity/profile-identity-metadata-contract";
import type { User } from "@supabase/supabase-js";

describe("profile identity metadata contract", () => {
  it("declares user_auth_identities as sole social SSOT; profiles columns are compatibility", () => {
    expect(SOCIAL_IDENTITY_SSOT_TABLE).toBe("user_auth_identities");
    expect(PROFILE_IDENTITY_COLUMN_ROLES.provider).toBe("COMPATIBILITY");
    expect(PROFILE_IDENTITY_COLUMN_ROLES.provider_user_id).toBe("COMPATIBILITY");
  });

  it("forbids auth UUID as social provider_user_id", () => {
    const uid = "11111111-2222-3333-4444-555555555555";
    expect(isForbiddenSocialProviderUserId(uid, uid)).toBe(true);
    expect(isForbiddenSocialProviderUserId("5068317718", uid)).toBe(false);
  });

  it("extractOAuthProfileSeed recovers Kakao from synthetic email + metadata", () => {
    const user = {
      id: "11111111-2222-3333-4444-555555555555",
      email: "kakao.5068317718@kakao.native.dibay.internal",
      app_metadata: { provider: "email" },
      user_metadata: { provider: "kakao", kakao_id: "5068317718", nickname: "김대만" },
      identities: [],
    } as unknown as User;
    const seed = extractOAuthProfileSeed(user);
    expect(seed.authProvider).toBe("kakao");
    expect(seed.providerUserIdCandidate).toBe("5068317718");
    expect(seed.providerUserIdCandidate).not.toBe(user.id);
  });
});
