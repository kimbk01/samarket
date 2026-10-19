import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

type Call = { table: string; op: string; args: unknown[] };

/** 최소 Supabase 체인 목 — 테이블별 결과를 돌려주고 호출을 기록한다. */
function fakeSb(results: Record<string, unknown>, calls: Call[]) {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {};
      const chain = (op: string) =>
        (...args: unknown[]) => {
          calls.push({ table, op, args });
          return b;
        };
      for (const op of ["select", "eq", "in", "neq", "is", "or", "gte", "order", "limit", "update", "delete", "insert"]) {
        b[op] = chain(op);
      }
      const res = () => (results[table] ?? { data: null, error: null, count: 0 }) as object;
      b.maybeSingle = () => Promise.resolve(res());
      b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(res()).then(resolve, reject);
      return b;
    },
  };
}

const requireAdminPermission = vi.fn();
/** 방 유형 게이트(`requireChatRoomAdmin`)는 actor 를 먼저 받고 방 chat_domain 으로 권한을 판정한다. */
const requireAdminApiActor = vi.fn();
const requireSuperAdmin = vi.fn();
const appendAdminRouteAudit = vi.fn();
const getDetail = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (k: string) => requireAdminPermission(k),
  requireSuperAdmin: () => requireSuperAdmin(),
  requireAdminApiActor: () => requireAdminApiActor(),
}));
vi.mock("@/lib/admin/admin-user-server", () => ({
  permissionKeyAllowed: (perms: string[], k: string) => perms.includes(k),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...a: unknown[]) => appendAdminRouteAudit(...a),
}));
vi.mock("@/lib/admin-community-messenger/service", () => ({
  getAdminCommunityMessengerRoomDetail: (id: string) => getDetail(id),
}));

const DETAIL = {
  room: { id: "room-1", lastMessage: "secret preview" },
  participants: [],
  messages: [{ id: "m1", content: "secret" }],
  calls: [],
  activeCalls: [],
  callAudits: [],
  reports: [],
};

function actor(isSuperAdmin: boolean, permissions: string[] = ["chats"]) {
  return { userId: "admin-1", isSuperAdmin, permissions, role: "admin", profile: {} };
}

describe("CM room detail GET — ghost gate + server audit", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminPermission.mockReset();
    requireAdminApiActor.mockReset();
    appendAdminRouteAudit.mockReset();
    getDetail.mockReset();
    getDetail.mockResolvedValue(DETAIL);
  });

  async function call(url: string, isSuperAdmin: boolean, results: Record<string, unknown>) {
    const calls: Call[] = [];
    requireAdminApiActor.mockResolvedValue({ ok: true, actor: actor(isSuperAdmin), sb: fakeSb(results, calls) });
    const { GET } = await import("@/app/api/admin/community-messenger/rooms/[id]/route");
    const res = await GET(new Request(url) as never, { params: Promise.resolve({ id: "room-1" }) });
    return { res, json: await res.json(), calls };
  }

  const privateDirect = {
    community_messenger_rooms: { data: { id: "room-1", room_type: "direct", chat_domain: "general_direct" }, error: null },
    community_messenger_reports: { data: null, error: null, count: 0 },
    store_orders: { data: null, error: null },
    audit_logs: { data: [], error: null },
  };

  it("403 without chats permission (1:1 room — products/business do not apply)", async () => {
    requireAdminApiActor.mockResolvedValue({
      ok: true,
      actor: actor(false, ["products", "business"]),
      sb: fakeSb(privateDirect, []),
    });
    const { GET } = await import("@/app/api/admin/community-messenger/rooms/[id]/route");
    const res = await GET(new Request("https://x/api") as never, { params: Promise.resolve({ id: "room-1" }) });
    expect(res.status).toBe(403);
    expect(getDetail).not.toHaveBeenCalled();
  });

  it("trade room opens for products admin without chats (설계 §2-2)", async () => {
    const calls: Call[] = [];
    requireAdminApiActor.mockResolvedValue({
      ok: true,
      actor: actor(false, ["products"]),
      sb: fakeSb(
        {
          ...privateDirect,
          community_messenger_rooms: { data: { id: "room-1", room_type: "direct", chat_domain: "trade" }, error: null },
        },
        calls
      ),
    });
    const { GET } = await import("@/app/api/admin/community-messenger/rooms/[id]/route");
    const res = await GET(new Request("https://x/api") as never, { params: Promise.resolve({ id: "room-1" }) });
    expect(res.status).toBe(200);
    expect(getDetail).toHaveBeenCalled();
  });

  it("unlinked private room: non-super admin gets no messages and no audit", async () => {
    const { json } = await call("https://x/api", false, privateDirect);
    expect(json.messages).toEqual([]);
    expect(json.room.lastMessage).toBe("-");
    expect(json.contentAccess).toMatchObject({ granted: false, denial: "super_admin_only" });
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });

  it("unlinked private room: super admin without reason is locked", async () => {
    const { json } = await call("https://x/api?reason=short", true, privateDirect);
    expect(json.messages).toEqual([]);
    expect(json.contentAccess).toMatchObject({ granted: false, denial: "ghost_reason_required" });
  });

  it("super admin + reason: messages returned and content_view audited server-side", async () => {
    const reason = "법적 요청 2026-123 확인 목적";
    const { json, calls } = await call(`https://x/api?reason=${encodeURIComponent(reason)}`, true, privateDirect);
    expect(json.messages).toHaveLength(1);
    expect(json.contentAccess).toMatchObject({ granted: true, basis: "ghost" });
    expect(appendAdminRouteAudit).toHaveBeenCalledTimes(1);
    const input = appendAdminRouteAudit.mock.calls[0][2] as { action: string; after: Record<string, unknown> };
    expect(input.action).toBe("chat_room.content_view");
    expect(input.after).toMatchObject({ roomId: "room-1", chatDomain: "general_direct", reason, ghost: true });
    // ghost view never writes participants / read markers / messages
    expect(calls.some((c) => ["insert", "update", "delete"].includes(c.op))).toBe(false);
  });

  it("room with open report opens for chats admin (linked case)", async () => {
    const { json } = await call("https://x/api", false, {
      ...privateDirect,
      community_messenger_reports: { data: null, error: null, count: 1 },
    });
    expect(json.messages).toHaveLength(1);
    expect(json.contentAccess).toMatchObject({ granted: true, basis: "linked_report" });
    expect(appendAdminRouteAudit).toHaveBeenCalledTimes(1);
  });
});

describe("legacy chat bulk delete — super admin, L3, evidence kept", () => {
  beforeEach(() => {
    vi.resetModules();
    requireSuperAdmin.mockReset();
    appendAdminRouteAudit.mockReset();
  });

  const body = (extra: Record<string, unknown> = {}) =>
    new Request("https://x/api/admin/chat/rooms/bulk-delete", {
      method: "POST",
      body: JSON.stringify({
        items: [
          { id: "r1", storage: "chat_rooms" },
          { id: "r2", storage: "chat_rooms" },
        ],
        reason: "법원 명령 2026-1 처리 요청",
        confirmText: "DELETE",
        ...extra,
      }),
    });

  it("403 for non-super admin", async () => {
    requireSuperAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "super_admin_only" }, { status: 403 }),
    });
    const { POST } = await import("@/app/api/admin/chat/rooms/bulk-delete/route");
    const res = await POST(body() as never);
    expect(res.status).toBe(403);
  });

  it("400 without typed confirmation", async () => {
    requireSuperAdmin.mockResolvedValue({ ok: true, actor: actor(true), sb: fakeSb({}, []) });
    const { POST } = await import("@/app/api/admin/chat/rooms/bulk-delete/route");
    const res = await POST(body({ confirmText: "nope" }) as never);
    expect(res.status).toBe(400);
  });

  it("skips rooms with report evidence, never deletes reports/moderation_actions, audits", async () => {
    const calls: Call[] = [];
    const sb = fakeSb(
      {
        chat_reports: { data: [{ id: "cr1", room_id: "r2" }], error: null },
        reports: { data: [], error: null },
        moderation_actions: { data: null, error: null, count: 3 },
        chat_rooms: { data: null, error: null },
      },
      calls
    );
    requireSuperAdmin.mockResolvedValue({ ok: true, actor: actor(true), sb });
    const { POST } = await import("@/app/api/admin/chat/rooms/bulk-delete/route");
    const res = await POST(body() as never);
    const json = await res.json();
    expect(json.deleted).toEqual(["r1"]);
    expect(json.skipped).toEqual([{ id: "r2", storage: "chat_rooms", reason: "evidence_preserved" }]);
    const deletes = calls.filter((c) => c.op === "delete").map((c) => c.table);
    expect(deletes).toEqual(["chat_rooms"]);
    const roomDeleteIn = calls.find((c) => c.table === "chat_rooms" && c.op === "in");
    expect(roomDeleteIn?.args[1]).toEqual(["r1"]);
    expect(appendAdminRouteAudit).toHaveBeenCalledTimes(1);
    const input = appendAdminRouteAudit.mock.calls[0][2] as { action: string; after: Record<string, unknown> };
    expect(input.action).toBe("chat_room.hard_delete");
    expect(input.after).toMatchObject({ deletedIds: ["r1"], deletedCount: 1, evidencePreserved: true });
  });
});
