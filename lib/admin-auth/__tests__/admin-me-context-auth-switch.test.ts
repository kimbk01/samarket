/**
 * AD-08 — admin `/me` 스냅샷 계정 전환 초기화.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ bound: null as string | null, meUserId: "user-a", clears: 0 }));

vi.mock("@/lib/auth/client-instance-id", () => ({
  getBoundAuthUserId: () => state.bound,
}));
vi.mock("@/lib/admin/admin-fetch-client", () => ({
  adminFetch: async () =>
    new Response(JSON.stringify({ ok: true, userId: state.meUserId, role: "admin", permissions: ["users"] }), {
      status: 200,
    }),
  invalidateAdminFetchCache: () => {},
  clearAllAdminFetchCache: () => {
    state.clears += 1;
  },
}));

import {
  clearAdminMeSnapshot,
  fetchAdminMeSnapshot,
  peekAdminMeSnapshot,
  resetAdminClientStateForAuthChange,
} from "@/lib/admin-auth/admin-me-context";

describe("admin me snapshot (AD-08)", () => {
  beforeEach(() => {
    clearAdminMeSnapshot();
    state.bound = "user-a";
    state.meUserId = "user-a";
    state.clears = 0;
  });

  it("스냅샷은 userId 를 저장하고, 묶인 인증 user 가 바뀌면 스스로 버린다", async () => {
    const snap = await fetchAdminMeSnapshot();
    expect(snap?.userId).toBe("user-a");
    expect(peekAdminMeSnapshot()?.userId).toBe("user-a");

    state.bound = "user-b";
    expect(peekAdminMeSnapshot()).toBeNull();
    expect(state.clears).toBe(1);

    state.meUserId = "user-b";
    const next = await fetchAdminMeSnapshot();
    expect(next?.userId).toBe("user-b");
  });

  it("묶인 id 가 없으면(바인딩 전) 스냅샷을 유지한다", async () => {
    await fetchAdminMeSnapshot();
    state.bound = null;
    expect(peekAdminMeSnapshot()?.userId).toBe("user-a");
  });

  it("resetAdminClientStateForAuthChange 는 스냅샷과 admin fetch 캐시를 모두 지운다", async () => {
    await fetchAdminMeSnapshot();
    resetAdminClientStateForAuthChange();
    expect(peekAdminMeSnapshot()).toBeNull();
    expect(state.clears).toBe(1);
  });
});
