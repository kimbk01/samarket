// @vitest-environment jsdom
/**
 * 2026-11-09 Owner 결함 — 전화 인증 완료 후에도 시트가 안 닫히고 내정보·글쓰기가 「미인증」(앱 재시작 시에만 반영).
 * 원인: 수정 직후 재조회가 `getMyProfile()` → 앱 시작 프로필(예전 값)을 돌려받음.
 * 계약(F1): `refreshClientMemberAccountAfterMutation` 은 서버에서 새로 받아 앱 시작 프로필·로그인 캐시를 같은 값으로 맞춘다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileRow } from "@/lib/profile/types";

const fetchFresh = vi.fn<(source?: string) => Promise<ProfileRow | null>>();

vi.mock("@/lib/profile/fetch-me-profile-deduped", async (orig) => {
  const actual = await orig<typeof import("@/lib/profile/fetch-me-profile-deduped")>();
  return {
    ...actual,
    fetchMeProfileFresh: (source?: string) => fetchFresh(source),
    invalidateMeProfileDedupedCache: vi.fn(),
    fetchMeProfileDeduped: vi.fn(async () => ({ status: 0, json: null })),
  };
});
vi.mock("@/lib/addresses/mandatory-address-gate-client", () => ({
  invalidateMandatoryAddressGateClientCache: vi.fn(),
}));
vi.mock("@/lib/addresses/fetch-address-defaults-client", () => ({
  invalidateAddressDefaultsSnapshotCache: vi.fn(),
}));

import { refreshClientMemberAccountAfterMutation } from "@/lib/auth/sync-member-account-client";
import { peekAppBootProfile, resetAppBootStore, setAppBootProfile } from "@/lib/app-boot/app-boot-store";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { assertPhoneAllowsPostWrite } from "@/lib/posts/phone-gate-for-post-write";

const base = {
  id: "user-1",
  role: "user",
  email: "u1@example.com",
  provider: "google",
  auth_provider: "google",
  username: "dibay111111",
  nickname: "BK",
} as unknown as ProfileRow;

const unverified = {
  ...base,
  phone: null,
  phone_verified: false,
  phone_verified_at: null,
  phone_verification_status: "none",
} as unknown as ProfileRow;

const verified = {
  ...base,
  phone: "+639171234567",
  phone_verified: true,
  phone_verified_at: "2026-11-09T07:09:47.223Z",
  phone_verification_status: "verified",
} as unknown as ProfileRow;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  resetAppBootStore();
  // 앱을 켤 때 받은 프로필 = 미인증 (Owner 화면 상태 재현)
  setAppBootProfile(unverified);
  setSupabaseProfileCache(profileRowToClientProfile(unverified));
  fetchFresh.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  setSupabaseProfileCache(null);
});

describe("F1 수정 직후 다시 읽기 — 클라이언트 사본 전부 갱신", () => {
  it("인증 전: 앱 시작 프로필 때문에 getMyProfile 은 미인증, 글쓰기 검사도 막힘 (재현)", async () => {
    expect((await getMyProfile())?.phone_verified).toBe(false);
    expect((await assertPhoneAllowsPostWrite()).ok).toBe(false);
  });

  it("인증 후 F1: 서버 값으로 앱 시작 프로필·로그인 캐시 갱신 → 앱 재시작 없이 글쓰기 통과", async () => {
    fetchFresh.mockResolvedValue(verified);
    const fresh = await refreshClientMemberAccountAfterMutation();
    expect(fetchFresh).toHaveBeenCalledTimes(1);
    expect(fresh?.phone_verified).toBe(true);
    expect(peekAppBootProfile()?.phone_verified).toBe(true);
    expect(getCurrentUser()?.phone_verified).toBe(true);
    expect((await getMyProfile())?.phone_verified).toBe(true);
    expect((await assertPhoneAllowsPostWrite()).ok).toBe(true);
  });

  it("@아이디 변경 후 F1: 앱 시작 프로필이 새 아이디로 바뀐다 (예전 아이디로 덮어쓰기 없음)", async () => {
    fetchFresh.mockResolvedValue({ ...unverified, username: "bkkim" } as ProfileRow);
    await refreshClientMemberAccountAfterMutation();
    expect(peekAppBootProfile()?.username).toBe("bkkim");
  });

  it("서버 조회 실패: null 반환, 기존 사본은 그대로 (예전 값으로 덮어쓰지 않음)", async () => {
    fetchFresh.mockResolvedValue(null);
    expect(await refreshClientMemberAccountAfterMutation()).toBeNull();
    expect(peekAppBootProfile()?.phone_verified).toBe(false);
  });
});
