import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 감사 docs/dibay-messenger-full-audit-2026-10-21.md B-1 — 친구·차단 서버 결함 회귀 (fake supabase).
 * F-1 해제 시 방 복원 단일화 · F-3 내 소유 행만 정리 · F-4(D2) 차단한 쪽만 숨김 · F-5 동시 추가 23505 · F-11 조회 오류 throw
 */

type Op = { kind: string; args: unknown[] };
type Call = { table: string; ops: Op[]; terminal: "await" | "maybeSingle" };
type Result = { data: unknown; error: unknown };

let handler: (call: Call) => Result = () => ({ data: null, error: null });
const calls: Call[] = [];

function makeBuilder(table: string) {
  const ops: Op[] = [];
  const run = (terminal: Call["terminal"]) => {
    const call = { table, ops: [...ops], terminal };
    calls.push(call);
    return Promise.resolve(handler(call));
  };
  const builder: Record<string, unknown> = {};
  for (const kind of ["select", "eq", "or", "in", "is", "not", "order", "limit", "update", "insert", "delete", "upsert"]) {
    builder[kind] = (...args: unknown[]) => {
      ops.push({ kind, args });
      return builder;
    };
  }
  builder.maybeSingle = () => run("maybeSingle");
  builder.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
    run("await").then(resolve, reject);
  return builder;
}

const fakeSb = { from: (table: string) => makeBuilder(table) };

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => fakeSb }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => fakeSb }));

function has(call: Call, kind: string, ...args: unknown[]): boolean {
  return call.ops.some(
    (op) => op.kind === kind && args.every((a, i) => JSON.stringify(op.args[i]) === JSON.stringify(a))
  );
}

const participantUpdates = () =>
  calls.filter((c) => c.table === "community_messenger_participants" && has(c, "update"));

beforeEach(() => {
  calls.length = 0;
  handler = () => ({ data: null, error: null });
});

describe("F-1 — unblockUserSocial restores general 1:1 rooms for every unblock path", () => {
  it("restores the unblocker's hidden direct room and returns restoredRoomIds", async () => {
    const { unblockUserSocial } = await import("@/lib/community-messenger/social-relations");
    handler = (call) => {
      if (call.table === "user_social_relations" && call.terminal === "maybeSingle") {
        return { data: { id: "row-1", relation_type: "blocked", is_active: true }, error: null };
      }
      if (call.table === "user_social_relations") {
        /** 해제 직후 pair 조회 — 남은 차단 없음 */
        return { data: [{ owner_user_id: "a", relation_type: "blocked", is_active: false }], error: null };
      }
      if (call.table === "community_messenger_rooms") return { data: [{ id: "room-1" }], error: null };
      return { data: null, error: null };
    };
    const res = await unblockUserSocial("a", "b");
    expect(res.ok).toBe(true);
    expect(res.restoredRoomIds).toEqual(["room-1"]);
    const restores = participantUpdates();
    expect(restores.some((c) => has(c, "eq", "user_id", "a") && has(c, "eq", "room_id", "room-1"))).toBe(true);
  });

  it("does not restore when the unblock itself failed", async () => {
    const { unblockUserSocial } = await import("@/lib/community-messenger/social-relations");
    handler = (call) => {
      if (call.table === "user_social_relations" && call.terminal === "maybeSingle") {
        return { data: { id: "row-1", relation_type: "blocked", is_active: true }, error: null };
      }
      if (call.table === "user_social_relations" && has(call, "update")) {
        return { data: null, error: { message: "boom" } };
      }
      return { data: null, error: null };
    };
    const res = await unblockUserSocial("a", "b");
    expect(res.ok).toBe(false);
    expect(participantUpdates()).toHaveLength(0);
  });
});

describe("F-4 (D2) — block hides only the blocker's participant row", () => {
  it("hideDirectRoomsOnBlockForViewer never updates the blocked peer's row", async () => {
    const { hideDirectRoomsOnBlockForViewer } = await import("@/lib/community-messenger/participant-block-hide");
    handler = (call) => {
      if (call.table === "community_messenger_rooms" && call.terminal === "maybeSingle") {
        return { data: { id: "room-1", room_type: "direct" }, error: null };
      }
      if (call.table === "community_messenger_rooms") return { data: [{ id: "room-1" }], error: null };
      return { data: null, error: null };
    };
    const res = await hideDirectRoomsOnBlockForViewer({ viewerUserId: "blocker", peerUserId: "blocked" });
    expect(res).toEqual({ ok: true, hiddenRoomIds: ["room-1"] });
    const updates = participantUpdates();
    expect(updates).toHaveLength(1);
    expect(has(updates[0]!, "eq", "user_id", "blocker")).toBe(true);
    expect(updates.some((c) => has(c, "eq", "user_id", "blocked"))).toBe(false);
  });
});

describe("F-3 — block cleanup touches only rows owned by the blocker", () => {
  it("blockUserSocial deletes only owner→target favorites (no bidirectional or)", async () => {
    const { blockUserSocial } = await import("@/lib/community-messenger/social-relations");
    const res = await blockUserSocial("owner", "target");
    expect(res.ok).toBe(true);
    const favDeletes = calls.filter((c) => c.table === "community_friend_favorites" && has(c, "delete"));
    expect(favDeletes).toHaveLength(1);
    expect(has(favDeletes[0]!, "eq", "user_id", "owner")).toBe(true);
    expect(has(favDeletes[0]!, "eq", "target_user_id", "target")).toBe(true);
    expect(favDeletes[0]!.ops.some((op) => op.kind === "or")).toBe(false);
    /** 상대 소유 friend 행도 건드리지 않는다 */
    const friendDeletes = calls.filter((c) => c.table === "user_social_relations" && has(c, "delete"));
    expect(friendDeletes.every((c) => has(c, "eq", "owner_user_id", "owner"))).toBe(true);
  });
});

describe("F-5 — concurrent friend add (23505) is idempotent and never leaks DB text", () => {
  function addHandler(insertError: unknown, racedRow: unknown) {
    let relationReads = 0;
    return (call: Call): Result => {
      if (call.table === "user_social_relations" && has(call, "insert")) return { data: null, error: insertError };
      if (call.table === "user_social_relations" && call.terminal === "maybeSingle") {
        relationReads += 1;
        return { data: relationReads === 1 ? null : racedRow, error: null };
      }
      if (call.table === "user_social_relations") return { data: [], error: null };
      return { data: null, error: null };
    };
  }

  it("23505 + raced friend row → ok", async () => {
    const { addFriendSaved } = await import("@/lib/community-messenger/social-relations");
    handler = addHandler(
      { code: "23505", message: 'duplicate key value violates unique constraint "usr_owner_target"' },
      { id: "r", relation_type: "friend", is_active: true }
    );
    expect(await addFriendSaved("a", "b")).toEqual({ ok: true });
  });

  it("23505 + raced block row → blocked_target", async () => {
    const { addFriendSaved } = await import("@/lib/community-messenger/social-relations");
    handler = addHandler({ code: "23505", message: "duplicate key" }, { id: "r", relation_type: "blocked", is_active: true });
    expect(await addFriendSaved("a", "b")).toEqual({ ok: false, error: "blocked_target" });
  });

  it("other insert errors return a fixed code, not the raw DB message", async () => {
    const { addFriendSaved } = await import("@/lib/community-messenger/social-relations");
    handler = addHandler({ code: "XX000", message: "internal relation user_social_relations exploded" }, null);
    const res = await addFriendSaved("a", "b");
    expect(res).toEqual({ ok: false, error: "friend_add_failed" });
  });

  it("isUniqueViolationError recognises code and message forms", async () => {
    const { isUniqueViolationError } = await import("@/lib/community-messenger/social-relations");
    expect(isUniqueViolationError({ code: "23505" })).toBe(true);
    expect(isUniqueViolationError({ message: "duplicate key value violates unique constraint" })).toBe(true);
    expect(isUniqueViolationError({ code: "42P01" })).toBe(false);
  });
});

describe("F-11 — friend / hidden list read errors are not swallowed as []", () => {
  it("listHiddenUserRelationshipRows throws on DB error, [] only for missing table", async () => {
    const { listHiddenUserRelationshipRows } = await import("@/lib/community-messenger/social-relations");
    const { isMessengerSocialGraphReadError } = await import(
      "@/lib/community-messenger/friendship/social-graph-read-error"
    );
    handler = () => ({ data: null, error: { message: "connection reset" } });
    await expect(listHiddenUserRelationshipRows("a")).rejects.toSatisfy(isMessengerSocialGraphReadError);
    handler = () => ({ data: null, error: { message: 'relation "user_relationships" does not exist' } });
    await expect(listHiddenUserRelationshipRows("a")).resolves.toEqual([]);
  });

  it("listFriendSavedIds throws on DB error", async () => {
    const { listFriendSavedIds } = await import("@/lib/community-messenger/social-relations");
    handler = () => ({ data: null, error: { message: "timeout" } });
    await expect(listFriendSavedIds("a")).rejects.toThrow(/social_graph_read_failed/);
  });

  it("listContactFriendPeersForViewer throws on DB error", async () => {
    const { listContactFriendPeersForViewer } = await import(
      "@/lib/community-messenger/friendship/resolve-friendship-pair"
    );
    handler = () => ({ data: null, error: { message: "timeout" } });
    await expect(listContactFriendPeersForViewer(fakeSb as any, "a")).rejects.toThrow(/social_graph_read_failed/);
    handler = () => ({ data: [{ target_user_id: "b", created_at: "2026-10-21T00:00:00Z" }], error: null });
    await expect(listContactFriendPeersForViewer(fakeSb as any, "a")).resolves.toHaveLength(1);
  });
});
