import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P2-11 — 계정 전환 시 이전 계정 기기 row 만 비활성, 새 세션 회원 row 는 유지.
 */
const state = vi.hoisted(() => ({
  userId: "user-b" as string | null,
  ownRowFound: true,
  updates: [] as Array<{ patch: Record<string, unknown>; filters: Array<[string, string, unknown]> }>,
}));

function userDevicesTable() {
  return {
    select: () => {
      const chain = {
        eq: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: state.ownRowFound ? { id: "row-1" } : null, error: null }),
      };
      return chain;
    },
    update: (patch: Record<string, unknown>) => {
      const entry = { patch, filters: [] as Array<[string, string, unknown]> };
      state.updates.push(entry);
      const chain = {
        eq: (col: string, val: unknown) => {
          entry.filters.push(["eq", col, val]);
          return chain;
        },
        neq: (col: string, val: unknown) => {
          entry.filters.push(["neq", col, val]);
          return chain;
        },
        then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
      };
      return chain;
    },
  };
}

vi.mock("@/lib/auth/api-session", () => ({
  getOptionalAuthenticatedUserId: async () => state.userId,
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({ from: () => userDevicesTable() }),
}));
vi.mock("@/lib/push/push-environment", () => ({ resolvePushEnvironment: () => "production" }));
vi.mock("@/lib/push/dispatch/deactivate-bound-device-by-token-proof", () => ({
  deactivateBoundDeviceByTokenProof: vi.fn(async () => ({ ok: true, deactivated: 1 })),
}));
vi.mock("@/lib/push/dispatch/deactivate-failed-token", () => ({
  deactivateAllUserDevicesForLogout: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/me/devices/deactivate/route";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/me/devices/deactivate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/me/devices/deactivate scope=device_other_users (P2-11)", () => {
  beforeEach(() => {
    state.userId = "user-b";
    state.ownRowFound = true;
    state.updates = [];
  });

  it("기기 소유 증명이 있으면 다른 계정 row 만 비활성 (현재 회원 제외)", async () => {
    const res = await POST(req({ device_id: "dev-1", scope: "device_other_users", push_token: "tok" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, deactivated_other_users: true });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch).toMatchObject({ is_active: false });
    expect(state.updates[0].filters).toEqual(
      expect.arrayContaining([
        ["eq", "device_id", "dev-1"],
        ["neq", "user_id", "user-b"],
      ]),
    );
  });

  it("소유 증명이 없으면 아무 row 도 바꾸지 않는다 (임의 device_id 로 타 계정 차단 금지)", async () => {
    state.ownRowFound = false;
    const res = await POST(req({ device_id: "dev-1", scope: "device_other_users", push_token: "tok" }));
    expect(await res.json()).toMatchObject({ ok: true, deactivated_other_users: false });
    expect(state.updates).toHaveLength(0);
  });

  it("비로그인은 401", async () => {
    state.userId = null;
    const res = await POST(req({ device_id: "dev-1", scope: "device_other_users", push_token: "tok" }));
    expect(res.status).toBe(401);
  });
});
