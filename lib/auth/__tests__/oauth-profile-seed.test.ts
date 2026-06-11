import { describe, expect, it } from "vitest";
import { extractOAuthProfileSeed } from "@/lib/auth/oauth-profile-seed";
import type { User } from "@supabase/supabase-js";

function mockUser(partial: Partial<User>): User {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    phone: "",
    created_at: "",
    app_metadata: {},
    user_metadata: {},
    identities: [],
    ...partial,
  } as User;
}

describe("oauth-profile-seed", () => {
  it("maps Google picture and name", () => {
    const seed = extractOAuthProfileSeed(
      mockUser({
        app_metadata: { provider: "google" },
        user_metadata: { full_name: "Google User", picture: "https://img.example/a.png" },
      })
    );
    expect(seed.authProvider).toBe("google");
    expect(seed.nicknameCandidate).toBe("Google User");
    expect(seed.avatarCandidate).toBe("https://img.example/a.png");
  });

  it("maps Kakao nickname scope fields", () => {
    const seed = extractOAuthProfileSeed(
      mockUser({
        identities: [{ provider: "kakao", identity_data: { nickname: "카카오닉" } } as never],
        user_metadata: { avatar_url: "https://img.example/k.png" },
      })
    );
    expect(seed.authProvider).toBe("kakao");
    expect(seed.nicknameCandidate).toBe("카카오닉");
    expect(seed.avatarCandidate).toBe("https://img.example/k.png");
  });

  it("maps Apple full_name once", () => {
    const seed = extractOAuthProfileSeed(
      mockUser({
        app_metadata: { provider: "apple" },
        user_metadata: { full_name: "Apple User" },
        email: "relay@privaterelay.appleid.com",
      })
    );
    expect(seed.authProvider).toBe("apple");
    expect(seed.nicknameCandidate).toBe("Apple User");
    expect(seed.emailInternal).toBe("relay@privaterelay.appleid.com");
  });
});
