/**
 * 어드민 관심이웃 노출 삭제 (관심이웃 설계 E · 레거시 FAQ 102 「사용자 요청 시 노출 삭제」).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSb, type FakeDb } from "./neighbor-follow-fake-sb";

const MEMBER = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const REL_OUT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REL_IN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REL_FOREIGN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let db: FakeDb;
let fake: ReturnType<typeof createFakeSb>;
const audits: Array<Record<string, unknown>> = [];

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, sb: fake, actor: { userId: "admin-1" } }),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({
  appendAuditLog: async (_sb: unknown, row: Record<string, unknown>) => {
    audits.push(row);
  },
}));

function rel(id: string, user: string, target: string) {
  return { id, user_id: user, target_user_id: target, type: "neighbor_follow", relation_type: "neighbor_follow", created_at: "2026-11-01T00:00:00Z" };
}

beforeEach(() => {
  audits.length = 0;
  db = {
    user_relationships: [rel(REL_OUT, MEMBER, PEER), rel(REL_IN, PEER, MEMBER), rel(REL_FOREIGN, PEER, OTHER)],
    profiles: [
      { id: MEMBER, nickname: "회원", dibay_id: "member", status: "verified_user" },
      { id: PEER, nickname: "이웃", dibay_id: "peer", status: "verified_user" },
    ],
  };
  fake = createFakeSb(db);
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/admin/users/[id]/neighbor-relations", () => {
  it("GET — 이 회원이 추가한 · 이 회원을 추가한 관계", async () => {
    const { GET } = await import("@/app/api/admin/users/[id]/neighbor-relations/route");
    const res = await GET(new Request("http://x") as never, ctx(MEMBER));
    const j = (await res.json()) as {
      outgoing: { total: number; items: Array<{ id: string; name: string }> };
      incoming: { total: number; items: Array<{ id: string }> };
    };
    expect(j.outgoing.items.map((i) => i.id)).toEqual([REL_OUT]);
    expect(j.outgoing.items[0].name).toBe("이웃");
    expect(j.incoming.items.map((i) => i.id)).toEqual([REL_IN]);
  });

  async function del(relationId: string, body: unknown) {
    const { DELETE } = await import("@/app/api/admin/users/[id]/neighbor-relations/route");
    const req = new Request(`http://x/api/admin/users/${MEMBER}/neighbor-relations?id=${relationId}`, {
      method: "DELETE",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    Object.defineProperty(req, "nextUrl", { value: new URL(req.url) });
    const res = await DELETE(req as never, ctx(MEMBER));
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  it("DELETE — 사유 없으면 400, 행 그대로", async () => {
    expect((await del(REL_OUT, {})).status).toBe(400);
    expect(db.user_relationships).toHaveLength(3);
  });

  it("DELETE — 이 회원이 끼지 않은 관계는 404 (남의 행 삭제 금지)", async () => {
    expect((await del(REL_FOREIGN, { reason: "회원 요청" })).status).toBe(404);
    expect(db.user_relationships).toHaveLength(3);
  });

  it("DELETE — 삭제 + 감사 기록(사유·관리자)", async () => {
    const r = await del(REL_IN, { reason: "회원 요청으로 노출 삭제" });
    expect(r).toEqual({ status: 200, json: { ok: true } });
    expect(db.user_relationships!.map((x) => x.id).sort()).toEqual([REL_FOREIGN, REL_OUT].sort());
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "neighbor_follow_admin_remove", target_id: MEMBER, actor_id: "admin-1" });
    expect((audits[0].after_json as { reason: string }).reason).toBe("회원 요청으로 노출 삭제");
  });
});
