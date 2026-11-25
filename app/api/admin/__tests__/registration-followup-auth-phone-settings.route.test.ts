/**
 * 등록 후속 감사 7번 — 관리자 전화 인증 설정: 읽지 못하면 503 · 저장하지 않음 · `enabled` 는 쓰지 않음(ON/OFF 는 ops 경로).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  loadFailed: false,
  upserts: [] as Array<{ row: Record<string, unknown>; opts: unknown }>,
}));

const sb = {
  from: () => ({
    upsert: async (row: Record<string, unknown>, opts: unknown) => {
      state.upserts.push({ row, opts });
      return { error: null };
    },
  }),
};

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, sb, actor: { userId: "admin-1" } }),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: async () => undefined,
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => sb,
}));
vi.mock("@/lib/i18n/admin-server-language", () => ({
  adminServerText: async (k: string) => k,
}));
vi.mock("@/lib/auth/auth-phone-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/auth-phone-settings")>();
  return {
    ...actual,
    loadAuthPhoneSettings: async () => ({
      ...actual.DEFAULT_AUTH_PHONE_SETTINGS,
      enabled: true,
      otp_ttl_seconds: 300,
      ...(state.loadFailed ? { load_failed: true, enabled: false } : {}),
    }),
  };
});

import { GET, PATCH } from "@/app/api/admin/settings/auth-phone/route";

const patchReq = (body: Record<string, unknown>) =>
  new Request("https://example.test/api/admin/settings/auth-phone", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

beforeEach(() => {
  state.loadFailed = false;
  state.upserts.length = 0;
});

describe("관리자 전화 인증 설정 — 읽기 실패", () => {
  it("GET: 읽지 못하면 503 phone_settings_unavailable (기본값을 현재 설정처럼 주지 않음)", async () => {
    state.loadFailed = true;
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "phone_settings_unavailable" });
  });

  it("PATCH: 읽지 못하면 503 이고 저장하지 않는다", async () => {
    state.loadFailed = true;
    const res = await PATCH(patchReq({ otp_ttl_seconds: 600 }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "phone_settings_unavailable" });
    expect(state.upserts).toHaveLength(0);
  });

  it("PATCH: 정상이면 저장하지만 enabled 는 쓰지 않는다", async () => {
    const res = await PATCH(patchReq({ otp_ttl_seconds: 600 }));
    expect(res.status).toBe(200);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].row).not.toHaveProperty("enabled");
    expect(state.upserts[0].row).toMatchObject({ country_code: "PH", provider: "semaphore_local", otp_ttl_seconds: 600 });
    expect(state.upserts[0].opts).toEqual({ onConflict: "country_code,provider" });
  });

  it("PATCH: enabled 를 보내면 거절(ops 경로만)", async () => {
    const res = await PATCH(patchReq({ enabled: true }));
    expect(res.status).toBe(400);
    expect(state.upserts).toHaveLength(0);
  });

  it("관리자 화면은 503 이면 기본값 입력칸 대신 오류를 보인다", () => {
    const form = readFileSync(join(process.cwd(), "components/admin/settings/AuthLoginSettingsForm.tsx"), "utf8");
    expect(form).toContain('json?.error === "phone_settings_unavailable"');
    expect(form).toContain('t("admin_auth_phone_settings_unavailable")');
    expect(form).toContain(") : phoneUnavailable ? (");
  });
});
