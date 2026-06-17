import { describe, expect, it } from "vitest";
import {
  isTrustedMypageHubProfile,
  resolveTrustedMypageBoot,
} from "@/lib/my/mypage-hub-session-trust";
import type { MyPageData } from "@/lib/my/types";

const viewerId = "11111111-1111-4111-8111-111111111111";

function minimalBoot(profileId: string): MyPageData {
  return {
    profile: { id: profileId } as MyPageData["profile"],
    banner: null,
    bannerHidden: false,
    services: [],
    sections: [],
    mannerScore: 50,
    isBusinessMember: false,
    isAdmin: false,
    hasOwnerStore: false,
  };
}

describe("isTrustedMypageHubProfile", () => {
  it("matches when ids are equal", () => {
    expect(isTrustedMypageHubProfile(viewerId, viewerId)).toBe(true);
  });

  it("rejects empty or mismatched ids", () => {
    expect(isTrustedMypageHubProfile("", viewerId)).toBe(false);
    expect(isTrustedMypageHubProfile(viewerId, "")).toBe(false);
    expect(isTrustedMypageHubProfile(viewerId, "other-user")).toBe(false);
  });
});

describe("resolveTrustedMypageBoot", () => {
  it("prefers trusted RSC boot when provided", () => {
    const boot = minimalBoot(viewerId);
    expect(resolveTrustedMypageBoot(boot, null, viewerId)).toBe(boot);
  });

  it("falls back to trusted session boot when RSC is undefined", () => {
    const session = minimalBoot(viewerId);
    expect(resolveTrustedMypageBoot(undefined, session, viewerId)).toBe(session);
  });

  it("returns null when viewer is unknown or boot is untrusted", () => {
    const session = minimalBoot(viewerId);
    expect(resolveTrustedMypageBoot(undefined, session, null)).toBe(null);
    expect(resolveTrustedMypageBoot(undefined, minimalBoot("other"), viewerId)).toBe(null);
    expect(resolveTrustedMypageBoot(null, session, viewerId)).toBe(null);
  });
});
