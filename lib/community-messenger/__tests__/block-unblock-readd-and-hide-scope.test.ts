import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Block/unblock 결함 회귀:
 * - 해제된 차단 row(is_active=false)가 재친구 추가를 영구 차단하던 문제
 * - 차단 숨김이 검증 없는 roomId 힌트·공유 참여 방(거래/주문 direct) 까지 숨기던 문제
 * - 친구 숨김 toggle 비멱등
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

beforeEach(() => {
  calls.length = 0;
  handler = () => ({ data: null, error: null });
});

describe("addFriendSaved — unblock → re-add", () => {
  it("converts an inactive (unblocked) block row into an active friend row", async () => {
    const { addFriendSaved } = await import("@/lib/community-messenger/social-relations");
    handler = (call) => {
      if (call.table === "user_social_relations" && has(call, "update")) {
        return { data: [{ id: "row-1" }], error: null };
      }
      if (call.table === "user_social_relations" && call.terminal === "maybeSingle") {
        return { data: { id: "row-1", relation_type: "blocked", is_active: false }, error: null };
      }
      if (call.table === "user_social_relations") {
        /** pair block lookup — 해제 이력만 존재 */
        return { data: [{ owner_user_id: "a", relation_type: "blocked", is_active: false }], error: null };
      }
      return { data: null, error: null };
    };
    const res = await addFriendSaved("a", "b");
    expect(res).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "user_social_relations" && has(c, "update"));
    expect(update).toBeTruthy();
    const patch = update!.ops.find((op) => op.kind === "update")!.args[0] as Record<string, unknown>;
    expect(patch.relation_type).toBe("friend");
    expect(patch.is_active).toBe(true);
    expect(has(update!, "eq", "is_active", false)).toBe(true);
    expect(calls.some((c) => c.table === "user_social_relations" && has(c, "insert"))).toBe(false);
  });

  it("still refuses when the block row is active", async () => {
    const { addFriendSaved } = await import("@/lib/community-messenger/social-relations");
    handler = (call) => {
      if (call.table === "user_social_relations" && call.terminal === "maybeSingle") {
        return { data: { id: "row-1", relation_type: "blocked", is_active: true }, error: null };
      }
      return { data: [], error: null };
    };
    const res = await addFriendSaved("a", "b");
    expect(res).toEqual({ ok: false, error: "blocked_target" });
    expect(calls.some((c) => has(c, "update") || has(c, "insert"))).toBe(false);
  });

  it("inactive block row is not treated as a block by the pair SSOT", async () => {
    const { isBlockedEitherWayActive } = await import("@/lib/community-messenger/social-relations");
    handler = (call) => {
      if (call.table === "user_social_relations") {
        return { data: [{ owner_user_id: "a", relation_type: "blocked", is_active: false }], error: null };
      }
      return { data: null, error: null };
    };
    expect(await isBlockedEitherWayActive("a", "b")).toBe(false);
  });

  it("unblock releases legacy user_blocks rows (fallback reader would otherwise keep the block)", async () => {
    const { unblockUserSocial } = await import("@/lib/community-messenger/social-relations");
    handler = (call) => {
      if (call.table === "user_social_relations" && call.terminal === "maybeSingle") {
        return { data: { id: "row-1", relation_type: "blocked", is_active: true }, error: null };
      }
      return { data: null, error: null };
    };
    const res = await unblockUserSocial("a", "b");
    expect(res.ok).toBe(true);
    const release = calls.find((c) => c.table === "user_blocks" && has(c, "update"));
    expect(release).toBeTruthy();
    expect(has(release!, "eq", "user_id", "a")).toBe(true);
    expect(has(release!, "eq", "blocked_user_id", "b")).toBe(true);
    expect(has(release!, "is", "released_at", null)).toBe(true);
  });
});

describe("resolveDirectRoomIdsForPair — pair general direct only", () => {
  const roomsHandler = (rows: Array<{ id: string }>) => (call: Call): Result => {
    if (call.table === "community_messenger_rooms") return { data: rows, error: null };
    return { data: [], error: null };
  };

  it("filters by pair direct_key + general chat_domain and never falls back to shared rooms", async () => {
    const { resolveDirectRoomIdsForPair, BLOCK_HIDE_GENERAL_DIRECT_CHAT_DOMAIN_FILTER } = await import(
      "@/lib/community-messenger/participant-block-hide"
    );
    handler = roomsHandler([]);
    const ids = await resolveDirectRoomIdsForPair(fakeSb as any, "u-b", "u-a");
    expect(ids).toEqual([]);
    const roomQuery = calls.find((c) => c.table === "community_messenger_rooms")!;
    expect(has(roomQuery, "eq", "room_type", "direct")).toBe(true);
    expect(has(roomQuery, "eq", "direct_key", "u-a:u-b")).toBe(true);
    expect(has(roomQuery, "or", BLOCK_HIDE_GENERAL_DIRECT_CHAT_DOMAIN_FILTER)).toBe(true);
    expect(BLOCK_HIDE_GENERAL_DIRECT_CHAT_DOMAIN_FILTER).not.toMatch(/trade|store_order|group/);
    /** 공유 참여 방 fallback 제거 — participants 조회 없음 */
    expect(calls.some((c) => c.table === "community_messenger_participants")).toBe(false);
  });

  it("rejects an invalid hint (e.g. trade/store_order room) and uses only validated pair rooms", async () => {
    const { resolveDirectRoomIdsForPair } = await import("@/lib/community-messenger/participant-block-hide");
    handler = roomsHandler([{ id: "general-room" }]);
    expect(await resolveDirectRoomIdsForPair(fakeSb as any, "u-a", "u-b", "trade-room")).toEqual(["general-room"]);
    handler = roomsHandler([]);
    expect(await resolveDirectRoomIdsForPair(fakeSb as any, "u-a", "u-b", "trade-room")).toEqual([]);
  });

  it("accepts the hint only when it satisfies the predicate", async () => {
    const { resolveDirectRoomIdsForPair } = await import("@/lib/community-messenger/participant-block-hide");
    handler = roomsHandler([{ id: "general-room" }, { id: "general-room-2" }]);
    expect(await resolveDirectRoomIdsForPair(fakeSb as any, "u-a", "u-b", "general-room-2")).toEqual([
      "general-room-2",
    ]);
  });

  it("D2 — reverse block active: restores only the unblocker's row, never the peer (still blocking) row", async () => {
    const { restoreDirectRoomsOnUnblockForViewer } = await import(
      "@/lib/community-messenger/participant-block-hide"
    );
    handler = (call) => {
      if (call.table === "user_social_relations") {
        return { data: [{ owner_user_id: "u-b", relation_type: "blocked", is_active: true }], error: null };
      }
      if (call.table === "community_messenger_rooms") return { data: [{ id: "general-room" }], error: null };
      return { data: null, error: null };
    };
    const res = await restoreDirectRoomsOnUnblockForViewer("u-a", "u-b");
    expect(res).toEqual({ ok: true, restoredRoomIds: ["general-room"] });
    const restores = calls.filter((c) => c.table === "community_messenger_participants" && has(c, "update"));
    expect(restores).toHaveLength(1);
    expect(has(restores[0]!, "eq", "user_id", "u-a")).toBe(true);
    expect(restores.some((c) => has(c, "eq", "user_id", "u-b"))).toBe(false);
  });

  it("restores nothing while the viewer still blocks the peer (legacy residue)", async () => {
    const { restoreDirectRoomsOnUnblockForViewer } = await import(
      "@/lib/community-messenger/participant-block-hide"
    );
    handler = (call) => {
      if (call.table === "user_social_relations") {
        return {
          data: [
            { owner_user_id: "u-a", relation_type: "blocked", is_active: true },
            { owner_user_id: "u-b", relation_type: "blocked", is_active: true },
          ],
          error: null,
        };
      }
      if (call.table === "community_messenger_rooms") return { data: [{ id: "general-room" }], error: null };
      return { data: null, error: null };
    };
    const res = await restoreDirectRoomsOnUnblockForViewer("u-a", "u-b");
    expect(res).toEqual({ ok: true, restoredRoomIds: [] });
    expect(calls.some((c) => c.table === "community_messenger_participants" && has(c, "update"))).toBe(false);
  });

  it("unblock restores both participants when no block remains", async () => {
    const { restoreDirectRoomsOnUnblockForViewer } = await import(
      "@/lib/community-messenger/participant-block-hide"
    );
    handler = (call) => {
      if (call.table === "user_social_relations") {
        return { data: [{ owner_user_id: "u-a", relation_type: "blocked", is_active: false }], error: null };
      }
      if (call.table === "community_messenger_rooms") return { data: [{ id: "general-room" }], error: null };
      return { data: null, error: null };
    };
    const res = await restoreDirectRoomsOnUnblockForViewer("u-a", "u-b");
    expect(res).toEqual({ ok: true, restoredRoomIds: ["general-room"] });
    const restores = calls.filter((c) => c.table === "community_messenger_participants" && has(c, "update"));
    expect(restores).toHaveLength(2);
  });
});

describe("block call termination action", () => {
  it("maps blocker role to cancel / reject / end", async () => {
    const { resolveBlockCallTerminationAction } = await import(
      "@/lib/community-messenger/block-call-termination"
    );
    const base = { blockerUserId: "a", initiatorUserId: "a", recipientUserId: "b" };
    expect(resolveBlockCallTerminationAction({ ...base, status: "ringing" })).toBe("cancel");
    expect(
      resolveBlockCallTerminationAction({ ...base, initiatorUserId: "b", recipientUserId: "a", status: "ringing" })
    ).toBe("reject");
    expect(resolveBlockCallTerminationAction({ ...base, status: "active" })).toBe("end");
    expect(resolveBlockCallTerminationAction({ ...base, status: "ended" })).toBeNull();
    expect(resolveBlockCallTerminationAction({ ...base, blockerUserId: "c", status: "active" })).toBeNull();
  });
});

describe("friend hidden toggle — idempotent set contract", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("service accepts explicit desired state and errors on non-missing-table select failure", () => {
    const src = read("lib/community-messenger/service.ts");
    const start = src.indexOf("export async function toggleCommunityMessengerHiddenFriend(");
    const body = src.slice(start, src.indexOf("export async function removeCommunityMessengerFriend(", start));
    expect(body).toContain("desiredHidden?: boolean");
    expect(body).toContain('typeof desiredHidden === "boolean" ? desiredHidden : !currentlyHidden');
    expect(body).toContain("if (selectError && !isMissingTableError(selectError))");
    expect(body).not.toContain("!selectError || !isMissingTableError(selectError)");
    expect(body).not.toContain(".maybeSingle()");
    expect(body).toContain("if (currentlyHidden) return { ok: true, isHidden: true };");
  });

  it("route reads optional { hidden } body and web client sends explicit state", () => {
    const route = read("app/api/community-messenger/friends/[friendUserId]/hidden/route.ts");
    expect(route).toContain('typeof body?.hidden === "boolean"');
    expect(route).toContain("toggleCommunityMessengerHiddenFriend(auth.userId, friendUserId, desiredHidden)");
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toContain("body: JSON.stringify({ hidden: !currentlyHidden })");
  });

  it("block route failure no longer reports blocked:true", () => {
    const route = read("app/api/community-messenger/relations/block/route.ts");
    expect(route).not.toContain("{ ...result, blocked: true }, { status: 400 }");
    expect(route).toContain("terminateDirectCallsOnBlock");
  });
});
