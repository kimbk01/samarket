import { beforeEach, describe, expect, it, vi } from "vitest";

/** 관리자 아이디 변경 사유 필수 — 서버(API) 단계. DB(admin_set_dibay_id) 단계는 격리 DB 시나리오로 검증. */

const rpc = vi.fn();
let nicknameTaken = false;
vi.mock("@/lib/profile/member-nickname-policy", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, isMemberNicknameTaken: async () => nicknameTaken };
});
const updates: Array<Record<string, unknown>> = [];

const fakeSb = {
  rpc: (...args: unknown[]) => rpc(...args),
  from: () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.maybeSingle = async () => ({
      data: { id: "u1", dibay_id: "dibay_a1b2c3", username: "dibay_a1b2c3", email: null, auth_login_email: null, provider: "google", auth_provider: "google" },
      error: null,
    });
    q.update = (p: Record<string, unknown>) => {
      updates.push(p);
      return { eq: async () => ({ error: null }) };
    };
    return q;
  },
  auth: { admin: { getUserById: async () => ({ data: { user: { email: null } } }), updateUserById: async () => ({ error: null }) } },
};

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({
    ok: true,
    sb: fakeSb,
    actor: { userId: "admin-1", isSuperAdmin: false },
  }),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: async () => undefined }));

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/admin/users/[id]/route");
  const req = new Request("http://localhost/api/admin/users/u1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await PATCH(req as never, { params: Promise.resolve({ id: "u1" }) } as never);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("PATCH /api/admin/users/:id — dibayId reason", () => {
  beforeEach(() => {
    rpc.mockReset();
    updates.length = 0;
  });

  it("rejects an ID change without a reason before touching the DB", async () => {
    const r = await patch({ dibayId: "new_id1" });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("dibay_id_reason_required");
    expect(rpc).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("rejects a blank reason", async () => {
    const r = await patch({ dibayId: "new_id1", dibayIdReason: "   " });
    expect(r.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the reason and actor to admin_set_dibay_id (no direct dibay_id/username/right-flag write)", async () => {
    rpc.mockResolvedValue({ data: { ok: true, dibay_id: "new_id1", before: "dibay_a1b2c3" }, error: null });
    const r = await patch({ dibayId: "@New_ID1", dibayIdReason: "회원 요청 — 오타 정정" });
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_set_dibay_id", {
      p_target_user_id: "u1",
      p_dibay_id: "new_id1",
      p_actor_user_id: "admin-1",
      p_reason: "회원 요청 — 오타 정정",
    });
    for (const u of updates) {
      for (const k of ["dibay_id", "username", "dibay_id_changed_once", "dibay_id_auto_assigned", "dibay_id_locked"]) {
        expect(u).not.toHaveProperty(k);
      }
    }
  });

  it("admin nickname uses the member SSOT rule (2–20 chars)", async () => {
    const r = await patch({ nickname: "a" });
    expect(r.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("taken nickname is rejected before the ID-change RPC (no partial write)", async () => {
    nicknameTaken = true;
    const r = await patch({ dibayId: "new_id1", dibayIdReason: "정정", nickname: "중복이름" });
    nicknameTaken = false;
    expect(r.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("maps DB reason_required (defense in depth) to 400", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "reason_required" }, error: null });
    const r = await patch({ dibayId: "new_id1", dibayIdReason: "x" });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("reason_required");
  });
});
