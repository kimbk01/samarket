import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * R2 (2026-11-11) — iOS VoIP 토큰 무효화가 같은 회원의 다른 기기 VoIP 행을 끄지 않는다.
 * 계획: docs/audit/call-r2-voip-invalidate-scope-plan-2026-11-11.md
 */
const state = vi.hoisted(() => ({
  userId: "user-a" as string | null,
  updates: [] as Array<{ patch: Record<string, unknown>; filters: Array<[string, string, unknown]> }>,
}));

function userDevicesTable() {
  return {
    select: () => {
      const chain = {
        eq: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
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

const logoutMock = vi.hoisted(() => vi.fn(async () => undefined));

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
  deactivateAllUserDevicesForLogout: logoutMock,
}));

import { POST } from "@/app/api/me/devices/deactivate/route";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/me/devices/deactivate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/me/devices/deactivate — provider 단독 요청의 기기 범위 (R2)", () => {
  beforeEach(() => {
    state.userId = "user-a";
    state.updates = [];
    logoutMock.mockClear();
  });

  it("device_id 없이 push_provider 만 오면 400 이고 아무 행도 바꾸지 않는다", async () => {
    const res = await POST(req({ push_provider: "voip_apns" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "device_scope_required" });
    expect(state.updates).toHaveLength(0);
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it("device_id + push_provider 는 이 기기의 그 provider 행만 끈다", async () => {
    const res = await POST(req({ device_id: "ipad-1", push_provider: "voip_apns" }));
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch).toMatchObject({ is_active: false });
    expect(state.updates[0].filters).toEqual([
      ["eq", "user_id", "user-a"],
      ["eq", "device_id", "ipad-1"],
      ["eq", "push_provider", "voip_apns"],
      ["eq", "environment", "production"],
    ]);
  });

  it("device_id + push_token + push_provider 는 그 토큰 행만 끈다 (기존 경로 유지)", async () => {
    const res = await POST(req({ device_id: "ipad-1", push_token: "voip-tok", push_provider: "voip_apns" }));
    expect(res.status).toBe(200);
    expect(state.updates[0].filters).toEqual(
      expect.arrayContaining([
        ["eq", "push_token", "voip-tok"],
        ["eq", "push_provider", "voip_apns"],
      ]),
    );
  });

  it("로그아웃 본문(device_id 만)은 기존대로 그 기기 범위로 처리한다", async () => {
    const res = await POST(req({ device_id: "ipad-1" }));
    expect(res.status).toBe(200);
    expect(logoutMock).toHaveBeenCalledWith(expect.anything(), "user-a", "ipad-1", "production");
  });
});

describe("iOS VoIP 무효화 클라이언트 본문 계약 (R2)", () => {
  const src = readFileSync(join(process.cwd(), "lib/push/native/register-native-push-client.ts"), "utf8");
  const start = src.indexOf("const onInvalidated = () => {");
  const handler = src.slice(start, src.indexOf("};", start));

  it("무효화 요청에 device_id 를 싣는다", () => {
    expect(start).toBeGreaterThan(-1);
    expect(handler).toContain("device_id: ensureClientInstanceId()");
    expect(handler).toContain('push_provider: "voip_apns"');
  });

  it("provider 만 담은 본문을 보내지 않는다", () => {
    expect(handler).not.toContain('JSON.stringify({ push_provider: "voip_apns" })');
  });
});
