import { describe, expect, it } from "vitest";
import { isClientSignupComplete, profileToDibaySignupInput } from "@/lib/auth/client-signup-gate";
import type { Profile } from "@/lib/types/profile";
import { STORE_PRIVACY_VERSION, STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";

const consented = {
  terms_accepted_at: "2026-01-01T00:00:00.000Z",
  terms_version: STORE_TERMS_VERSION,
  privacy_accepted_at: "2026-01-01T00:00:00.000Z",
  privacy_version: STORE_PRIVACY_VERSION,
};

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
    email: "u1@test.local",
    nickname: "nick",
    avatar_url: null,
    temperature: 50,
    ...overrides,
  };
}

describe("client-signup-gate", () => {
  it("returns false when onboarding_completed_at is set but consent is missing", () => {
    const user = baseProfile({
      onboarding_completed_at: "2026-02-01T00:00:00.000Z",
      dibay_id: "boss_market",
      dibay_id_locked: true,
      display_name: "Boss",
      avatar_url: "https://img.example/a.png",
    });
    expect(isClientSignupComplete(user)).toBe(false);
  });

  it("returns true when consent is complete even if avatar is missing", () => {
    const user = baseProfile({
      ...consented,
      onboarding_completed_at: "2026-02-01T00:00:00.000Z",
      dibay_id: "boss_market",
      dibay_id_locked: true,
      display_name: "Boss",
      avatar_url: null,
    });
    expect(isClientSignupComplete(user)).toBe(true);
  });

  it("returns true when consent is complete even if dibay id and profile fields are incomplete", () => {
    const user = baseProfile({
      ...consented,
      dibay_id: "boss_market",
      dibay_id_locked: true,
      display_name: "Boss",
      avatar_url: null,
    });
    expect(isClientSignupComplete(user)).toBe(true);
  });

  it("returns true when consent is complete regardless of profile extras", () => {
    const user = baseProfile({
      ...consented,
      dibay_id: "boss_market",
      dibay_id_locked: true,
      display_name: "Boss Market",
      avatar_url: "https://img.example/avatar.png",
    });
    expect(isClientSignupComplete(user)).toBe(true);
  });

  it("maps missing profile fields safely to incomplete signup", () => {
    const user = baseProfile({ id: "u1", email: "x@y.z" });
    const input = profileToDibaySignupInput(user);
    expect(input.display_name).toBe("nick");
    expect(input.avatar_url).toBeNull();
    expect(isClientSignupComplete(user)).toBe(false);
  });
});
