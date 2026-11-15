import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D2-1 — device_id + push_provider(토큰 없음) 는 이 기기의 그 제공자 행만 비활성 (맥 voip_apns 정리).
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

describe("POST /api/me/devices/deactivate device_id + push_provider (D2-1)", () => {
  beforeEach(() => {
    state.userId = "user-mac";
    state.ownRowFound = true;
    state.updates = [];
  });

  it("이 회원·이 기기·이 제공자 행만 비활성 — 다른 기기 VoIP 는 건드리지 않음", async () => {
    const res = await POST(req({ device_id: "mac-dev", push_provider: "voip_apns" }));
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch).toMatchObject({ is_active: false });
    expect(state.updates[0].filters).toEqual([
      ["eq", "user_id", "user-mac"],
      ["eq", "device_id", "mac-dev"],
      ["eq", "push_provider", "voip_apns"],
      ["eq", "environment", "production"],
    ]);
  });

  it("push_provider 만 보내는 기존 요청은 기존 동작(회원의 그 제공자 전체) 그대로", async () => {
    await POST(req({ push_provider: "voip_apns" }));
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].filters).toEqual([
      ["eq", "user_id", "user-mac"],
      ["eq", "push_provider", "voip_apns"],
      ["eq", "environment", "production"],
    ]);
  });

  it("토큰 증명이 있는 로그아웃 요청은 기존 토큰 경로 그대로", async () => {
    await POST(req({ device_id: "mac-dev", push_provider: "apns", push_token: "tok" }));
    expect(state.updates[0].filters).toEqual(
      expect.arrayContaining([["eq", "push_token", "tok"]]),
    );
  });
});
