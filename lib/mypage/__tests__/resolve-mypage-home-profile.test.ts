import { beforeEach, describe, expect, it, vi } from "vitest";

const peekAppBootProfile = vi.fn();
const fetchMeProfileDeduped = vi.fn();
const isMeProfileFullFetchSkippable = vi.fn();
const peekMeProfileCached = vi.fn();

vi.mock("@/lib/app-boot/app-boot-store", () => ({
  peekAppBootProfile: (...args: unknown[]) => peekAppBootProfile(...args),
}));

vi.mock("@/lib/profile/fetch-me-profile-deduped", () => ({
  fetchMeProfileDeduped: (...args: unknown[]) => fetchMeProfileDeduped(...args),
  isMeProfileFullFetchSkippable: (...args: unknown[]) => isMeProfileFullFetchSkippable(...args),
  peekMeProfileCached: (...args: unknown[]) => peekMeProfileCached(...args),
}));

describe("resolveMypageHomeProfileResult", () => {
  beforeEach(() => {
    peekAppBootProfile.mockReset();
    fetchMeProfileDeduped.mockReset();
    isMeProfileFullFetchSkippable.mockReset();
    peekMeProfileCached.mockReset();
    peekAppBootProfile.mockReturnValue(null);
    peekMeProfileCached.mockReturnValue(null);
    isMeProfileFullFetchSkippable.mockReturnValue(false);
  });

  it("classifies 500 as session_broken for re-login UX", async () => {
    fetchMeProfileDeduped.mockResolvedValue({
      status: 500,
      json: { ok: false, error: "Invalid UTF-8 sequence" },
    });
    const { resolveMypageHomeProfileResult } = await import(
      "@/lib/mypage/resolve-mypage-home-profile"
    );
    const result = await resolveMypageHomeProfileResult();
    expect(result).toEqual({ ok: false, kind: "session_broken", status: 500 });
  });

  it("classifies 401 as unauthenticated", async () => {
    fetchMeProfileDeduped.mockResolvedValue({ status: 401, json: { ok: false } });
    const { resolveMypageHomeProfileResult } = await import(
      "@/lib/mypage/resolve-mypage-home-profile"
    );
    const result = await resolveMypageHomeProfileResult();
    expect(result).toEqual({ ok: false, kind: "unauthenticated", status: 401 });
  });

  it("returns profile on 200 ok", async () => {
    const profile = { id: "user-1", nickname: "a" };
    fetchMeProfileDeduped.mockResolvedValue({
      status: 200,
      json: { ok: true, profile },
    });
    const { resolveMypageHomeProfileResult } = await import(
      "@/lib/mypage/resolve-mypage-home-profile"
    );
    const result = await resolveMypageHomeProfileResult();
    expect(result).toEqual({ ok: true, profile });
  });
});
