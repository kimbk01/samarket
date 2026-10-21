/**
 * P2-16 — 앱은 client_secret 원문 대신 `client_secret_configured` 플래그로 설정 여부를 판단하고,
 * 관리자 저장 시 비밀값은 Vault RPC 로만 보낸다 (테이블 client_secret = '').
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hasRequiredOAuthKeys } from "@/lib/auth/auth-providers";

const state = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  upserts: [] as Array<Record<string, unknown>>,
  rpcError: null as { message: string } | null,
}));

const sb = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
    state.rpcCalls.push({ fn, args });
    return { data: null, error: state.rpcError };
  },
  from: () => ({
    upsert: async (row: Record<string, unknown>) => {
      state.upserts.push(row);
      return { error: null };
    },
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: {
            id: "google",
            provider: "google",
            enabled: true,
            client_id: "cid",
            client_secret_configured: true,
            redirect_uri: "https://x.supabase.co/auth/v1/callback",
            scope: "",
            sort_order: 1,
          },
          error: null,
        }),
      }),
    }),
  }),
};

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin-1" }, sb }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => sb }));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({ appendAdminRouteAudit: async () => {} }));
vi.mock("@/lib/auth/auth-provider-store", () => ({
  loadAuthProviderRows: async () => [],
  loadAuthProviderByProvider: async () => ({
    id: "google",
    provider: "google",
    enabled: true,
    client_id: "cid",
    client_secret: "",
    client_secret_configured: true,
    redirect_uri: "https://x.supabase.co/auth/v1/callback",
    scope: "",
    sort_order: 1,
  }),
}));

import { POST } from "@/app/api/admin/auth-providers/route";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/auth-providers", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("hasRequiredOAuthKeys (P2-16)", () => {
  const base = { client_id: "cid", redirect_uri: "https://x/cb" };
  it("원문이 비어도 client_secret_configured=true 면 설정됨", () => {
    expect(hasRequiredOAuthKeys({ ...base, client_secret: "", client_secret_configured: true })).toBe(true);
  });
  it("이전 단계 호환 — 원문이 있으면 설정됨", () => {
    expect(hasRequiredOAuthKeys({ ...base, client_secret: "s" })).toBe(true);
  });
  it("둘 다 없으면 미설정", () => {
    expect(hasRequiredOAuthKeys({ ...base, client_secret: "", client_secret_configured: false })).toBe(false);
  });
});

describe("POST /api/admin/auth-providers (P2-16)", () => {
  beforeEach(() => {
    state.rpcCalls = [];
    state.upserts = [];
    state.rpcError = null;
    process.env.AUTH_REDIRECT_URI_WHITELIST = "https://x.supabase.co/auth/v1/callback";
  });

  it("새 비밀값 → Vault RPC 로 저장, 테이블에는 '' + configured=true", async () => {
    const res = await POST(req({ provider: "google", client_secret: "new-secret" }));
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toEqual([
      { fn: "admin_set_auth_provider_secret", args: { p_provider: "google", p_secret: "new-secret" } },
    ]);
    expect(state.upserts[0]).toMatchObject({ client_secret: "", client_secret_configured: true });
    expect(JSON.stringify(state.upserts)).not.toContain("new-secret");
    const json = await res.json();
    expect(json.provider.client_secret_configured).toBe(true);
    expect(JSON.stringify(json)).not.toContain("new-secret");
  });

  it("비밀값 생략 → RPC 없음, 비밀 칸·플래그를 건드리지 않음", async () => {
    const res = await POST(req({ provider: "google", enabled: false }));
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.upserts[0]).not.toHaveProperty("client_secret");
    expect(state.upserts[0]).not.toHaveProperty("client_secret_configured");
  });

  it("Vault RPC 실패 → 500, 평문으로 대체 저장하지 않음", async () => {
    state.rpcError = { message: "rpc missing" };
    const res = await POST(req({ provider: "google", client_secret: "new-secret" }));
    expect(res.status).toBe(500);
    expect(state.upserts).toHaveLength(0);
  });
});
