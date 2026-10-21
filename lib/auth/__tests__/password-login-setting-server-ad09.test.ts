/**
 * AD-09 — 아이디(password) 로그인 설정을 서버(식별자 해석 API)에서도 강제한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  rows: [] as Array<{ provider: string; enabled: boolean }>,
  error: null as { message: string } | null,
  resolveCalls: 0,
}));

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        order: async () => ({ data: state.error ? null : state.rows, error: state.error }),
      }),
    }),
  }),
}));
vi.mock("@/lib/security/rate-limit-presets", () => ({
  enforcePasswordLoginResolveQuota: async () => ({ ok: true }),
}));
vi.mock("@/lib/auth/resolve-password-login-identifier", () => ({
  resolvePasswordLoginIdentifier: async (raw: string) => {
    state.resolveCalls += 1;
    return { ok: true, identifier: raw };
  },
}));

import { isPasswordLoginEnabledServer } from "@/lib/auth/login-settings";
import { POST } from "@/app/api/auth/password-login/resolve-identifier/route";

function req() {
  return new NextRequest("http://localhost/api/auth/password-login/resolve-identifier", {
    method: "POST",
    body: JSON.stringify({ identifier: "ops@example.com" }),
    headers: { "content-type": "application/json" },
  });
}

describe("AD-09 password login server enforcement", () => {
  beforeEach(() => {
    state.rows = [];
    state.error = null;
    state.resolveCalls = 0;
  });

  it("설정 ON(현재 LIVE) → 기존과 동일하게 해석", async () => {
    state.rows = [{ provider: "password", enabled: true }];
    expect(await isPasswordLoginEnabledServer()).toBe(true);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(state.resolveCalls).toBe(1);
  });

  it("설정 OFF → 403 password_login_disabled, 식별자 해석 안 함", async () => {
    state.rows = [{ provider: "password", enabled: false }];
    expect(await isPasswordLoginEnabledServer()).toBe(false);
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "password_login_disabled" });
    expect(state.resolveCalls).toBe(0);
  });

  it("설정 조회 실패 → 로그인 경로를 막지 않음", async () => {
    state.error = { message: "timeout" };
    expect(await isPasswordLoginEnabledServer()).toBe(true);
  });
});
