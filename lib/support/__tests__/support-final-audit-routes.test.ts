/**
 * 고객 문의 최종 감사 2026-11-28 — 라우트 동작 (D1·D3·D4·D5·L3·L4·L10). 네트워크·DB 없음(가짜 클라이언트).
 */
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state: {
  rows: Record<string, Row[]>;
  adminKeys: string[];
  adminAllowed: boolean;
} = { rows: {}, adminKeys: [], adminAllowed: true };

/** 표마다 정해 둔 행을 돌려주는 가짜 — 필터는 보지 않는다(라우트가 무엇을 돌려주는지만 본다) */
function tableSb() {
  return {
    from(table: string) {
      const result = () => ({ data: state.rows[table] ?? [], error: null, count: (state.rows[table] ?? []).length });
      const chain: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, key) {
            if (key === "then") return (res: (v: unknown) => unknown) => res(result());
            if (key === "maybeSingle" || key === "single") {
              return async () => ({ data: (state.rows[table] ?? [])[0] ?? null, error: null });
            }
            return () => chain;
          },
        }
      );
      return chain;
    },
    rpc: async () => ({ data: null, error: { message: "no rpc" } }),
  };
}

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => tableSb() }));
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async (key: string) => {
    state.adminKeys.push(key);
    return state.adminAllowed
      ? { ok: true, actor: { userId: "22222222-2222-4222-8222-222222222222" }, sb: {} }
      : { ok: false, response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  },
}));
vi.mock("@/lib/admin/require-admin-api", () => ({
  // 고치기 전 control-plane 이 쓰던 가드 — 아무 어드민이나 통과
  requireAdminApiUser: async () => ({ ok: true, userId: "any-admin" }),
}));
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({ appendAdminRouteAudit: async () => undefined }));

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const CASE = "33333333-3333-4333-8333-333333333333";
const recent = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ created_at: new Date(Date.now() - (i + 1) * 5_000).toISOString() }));

beforeEach(() => {
  state.rows = {};
  state.adminKeys = [];
  state.adminAllowed = true;
});

describe("support final audit 2026-11-28 — routes", () => {
  it("D5: the 6th customer message within a minute → 429 rate_limited (nothing saved)", async () => {
    state.rows.support_messages = recent(5);
    const { POST } = await import("@/app/api/support/cases/[caseId]/route");
    const res = await POST(json(`http://x/api/support/cases/${CASE}`, "POST", { body: "또" }), {
      params: Promise.resolve({ caseId: CASE }),
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: "rate_limited" });
  });

  it("D5: opening a case is limited the same way", async () => {
    state.rows.support_messages = recent(5);
    const { POST } = await import("@/app/api/support/cases/open/route");
    const res = await POST(
      json("http://x/api/support/cases/open", "POST", {
        context: { enabled: true, audience: "MEMBER", category: "ORDER", sourceSurface: "mypage_customer_center" },
        initialSummary: "x",
      })
    );
    expect(res.status).toBe(429);
  });

  it("L10: ?summary=unread returns only the unread number", async () => {
    state.rows.support_cases = [{ requester_unread_count: 2 }, { requester_unread_count: 1 }];
    const { GET } = await import("@/app/api/support/cases/route");
    const res = await GET(json("http://x/api/support/cases?summary=unread&audience=MEMBER", "GET"));
    expect(await res.json()).toEqual({ ok: true, unread: 3 });
  });

  it("L3: the customer list never carries internal case fields", async () => {
    state.rows.support_cases = [
      {
        id: CASE, public_case_no: "SC-1", audience: "MEMBER", status: "WAITING_USER", requester_unread_count: 1,
        assigned_admin_id: "22222222-2222-4222-8222-222222222222", priority: "URGENT", admin_unread_count: 4,
        guidance_key: "g", subject: "ORDER · x", last_message_at: "t", created_at: "t", updated_at: "t",
      },
    ];
    const { GET } = await import("@/app/api/support/cases/route");
    const body = (await (await GET(json("http://x/api/support/cases?audience=MEMBER", "GET"))).json()) as {
      cases: Row[];
    };
    expect(body.cases).toHaveLength(1);
    for (const k of ["assigned_admin_id", "priority", "admin_unread_count", "guidance_key", "subject"]) {
      expect(body.cases[0]).not.toHaveProperty(k);
    }
    expect(body.cases[0]).toMatchObject({ id: CASE, requester_unread_count: 1 });
  });

  it("D3: the support control plane requires the support permission", async () => {
    state.adminAllowed = false;
    const { GET } = await import("@/app/api/admin/support-control-plane/route");
    const res = await GET();
    expect(state.adminKeys).toEqual(["support"]);
    expect(res.status).toBe(403);
  });

  it("D4: guidance read and write require the support permission", async () => {
    state.adminAllowed = false;
    const { GET, POST } = await import("@/app/api/admin/support/guidance/route");
    const g = await GET(json("http://x/api/admin/support/guidance?category=ACCOUNT&issueType=LOGIN", "GET"));
    const p = await POST(json("http://x/api/admin/support/guidance", "POST", { category: "ACCOUNT", issueType: "LOGIN" }));
    expect(state.adminKeys).toEqual(["support", "support"]);
    expect(g.status).toBe(403);
    expect(p.status).toBe(403);
  });

  it("L4: an unknown priority is rejected with a stable key before any write", async () => {
    const { PATCH } = await import("@/app/api/admin/support/cases/[caseId]/route");
    const res = await PATCH(json(`http://x/api/admin/support/cases/${CASE}`, "PATCH", { action: "priority", priority: "BOGUS" }), {
      params: Promise.resolve({ caseId: CASE }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_priority" });
  });

  it("D1: a reply with a malformed seenLastMessageAt is rejected (would under-count alerts)", async () => {
    const { PATCH } = await import("@/app/api/admin/support/cases/[caseId]/route");
    const res = await PATCH(
      json(`http://x/api/admin/support/cases/${CASE}`, "PATCH", { action: "reply", body: "답", seenLastMessageAt: "nope" }),
      { params: Promise.resolve({ caseId: CASE }) }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_seen_last_message_at" });
  });
});
