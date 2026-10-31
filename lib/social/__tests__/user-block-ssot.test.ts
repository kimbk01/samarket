import { describe, expect, it } from "vitest";
import {
  fetchBlockedPairFromSb,
  filterCommentRowsExcludingBlockedRelations,
  isNotificationSuppressedForActor,
} from "@/lib/social/user-block-ssot";

type QueryCall = { table: string; filters: string[] };

function createCountingSb(handlers: {
  socialRows?: Array<{ owner_user_id: string; target_user_id?: string; is_active?: boolean | null; relation_type?: string }>;
  relRows?: Array<{ user_id: string }>;
  blockRows?: Array<{ user_id: string; blocked_user_id: string }>;
}) {
  const calls: QueryCall[] = [];
  const from = (table: string) => {
    const filters: string[] = [];
    const api: Record<string, unknown> = {};
    const chain = () => api;
    api.select = () => chain();
    api.eq = (col: string, val: unknown) => {
      filters.push(`eq:${col}=${String(val)}`);
      return chain();
    };
    api.or = (expr: string) => {
      filters.push(`or:${expr}`);
      return chain();
    };
    api.is = (col: string, val: unknown) => {
      filters.push(`is:${col}=${String(val)}`);
      return chain();
    };
    api.maybeSingle = async () => {
      calls.push({ table, filters: [...filters] });
      return { data: null, error: null };
    };
    api.then = undefined;
    // thenable — await query builder
    const result = async () => {
      calls.push({ table, filters: [...filters] });
      if (table === "user_social_relations") return { data: handlers.socialRows ?? [], error: null };
      if (table === "user_relationships") return { data: handlers.relRows ?? [], error: null };
      if (table === "user_blocks") return { data: handlers.blockRows ?? [], error: null };
      return { data: [], error: null };
    };
    // Make the builder awaitable
    (api as { then?: typeof Promise.prototype.then }).then = (onFulfilled, onRejected) =>
      result().then(onFulfilled as never, onRejected);
    return api;
  };
  return { sb: { from } as never, calls };
}

describe("fetchBlockedPairFromSb REST fan-out", () => {
  it("returns after SSOT hit without legacy queries (1 REST)", async () => {
    const { sb, calls } = createCountingSb({
      socialRows: [{ owner_user_id: "u1", relation_type: "blocked", is_active: true }],
    });
    const rel = await fetchBlockedPairFromSb(sb, "u1", "u2");
    expect(rel).toEqual({ blockedByMe: true, blockedByPeer: false, blockedEitherWay: true });
    expect(calls.map((c) => c.table)).toEqual(["user_social_relations"]);
  });

  it("SSOT 에 차단이 없으면 차단 없음 — legacy 표를 읽지 않는다 (1 REST, 예전 3)", async () => {
    const { sb, calls } = createCountingSb({
      socialRows: [],
      relRows: [{ user_id: "u2" }],
      blockRows: [{ user_id: "u2", blocked_user_id: "u1" }],
    });
    const rel = await fetchBlockedPairFromSb(sb, "u1", "u2");
    expect(rel).toEqual({ blockedByMe: false, blockedByPeer: false, blockedEitherWay: false });
    expect(calls.map((c) => c.table)).toEqual(["user_social_relations"]);
  });

  it("상대가 차단한 경우(SSOT) → blockedByPeer", async () => {
    const { sb, calls } = createCountingSb({
      socialRows: [{ owner_user_id: "u2", relation_type: "blocked", is_active: true }],
    });
    const rel = await fetchBlockedPairFromSb(sb, "u1", "u2");
    expect(rel).toEqual({ blockedByMe: false, blockedByPeer: true, blockedEitherWay: true });
    expect(calls).toHaveLength(1);
  });

  it("해제된 SSOT 행(is_active=false)은 차단 아님, is_active=null 은 활성(옛 행)", async () => {
    const inactive = createCountingSb({
      socialRows: [{ owner_user_id: "u1", relation_type: "blocked", is_active: false }],
    });
    expect((await fetchBlockedPairFromSb(inactive.sb, "u1", "u2")).blockedEitherWay).toBe(false);
    const legacyNull = createCountingSb({
      socialRows: [{ owner_user_id: "u1", relation_type: "blocked", is_active: null }],
    });
    expect((await fetchBlockedPairFromSb(legacyNull.sb, "u1", "u2")).blockedByMe).toBe(true);
  });
});

describe("fetchBlockedAuthorIdsForViewerSb", () => {
  it("SSOT 양방향 1회로 차단 상대 id 합집합", async () => {
    const { fetchBlockedAuthorIdsForViewerSb } = await import("@/lib/social/user-block-ssot");
    const { sb, calls } = createCountingSb({
      socialRows: [
        { owner_user_id: "v", target_user_id: "x", relation_type: "blocked", is_active: true },
        { owner_user_id: "y", target_user_id: "v", relation_type: "blocked", is_active: true },
      ],
    });
    const metrics = { supabaseSelectCalls: 0 };
    const ids = await fetchBlockedAuthorIdsForViewerSb(sb, "v", metrics);
    expect([...ids].sort()).toEqual(["x", "y"]);
    expect(calls.map((c) => c.table)).toEqual(["user_social_relations"]);
    expect(metrics.supabaseSelectCalls).toBe(1);
  });
});

describe("filterCommentRowsExcludingBlockedRelations", () => {
  const rows = [
    { id: "c1", user_id: "author-a", parent_id: null },
    { id: "c2", user_id: "author-b", parent_id: null },
    { id: "c3", user_id: "author-c", parent_id: "c2" },
    { id: "c4", user_id: "author-d", parent_id: "c3" },
  ];

  it("hides blocked author's own comments", () => {
    const out = filterCommentRowsExcludingBlockedRelations(rows, new Set(["author-b"]));
    expect(out.map((r) => r.id)).toEqual(["c1"]);
  });

  it("hides replies under blocked ancestor authors", () => {
    const out = filterCommentRowsExcludingBlockedRelations(rows, new Set(["author-b"]));
    expect(out.some((r) => r.id === "c3")).toBe(false);
    expect(out.some((r) => r.id === "c4")).toBe(false);
  });

  it("keeps unrelated threads when only one author is blocked", () => {
    const out = filterCommentRowsExcludingBlockedRelations(rows, new Set(["author-a"]));
    expect(out.map((r) => r.id).sort()).toEqual(["c2", "c3", "c4"]);
  });
});

describe("isNotificationSuppressedForActor", () => {
  it("suppresses when either direction blocked", () => {
    expect(
      isNotificationSuppressedForActor({
        blockedByMe: true,
        blockedByPeer: false,
        blockedEitherWay: true,
      })
    ).toBe(true);
    expect(
      isNotificationSuppressedForActor({
        blockedByMe: false,
        blockedByPeer: true,
        blockedEitherWay: true,
      })
    ).toBe(true);
    expect(
      isNotificationSuppressedForActor({
        blockedByMe: false,
        blockedByPeer: false,
        blockedEitherWay: false,
      })
    ).toBe(false);
  });
});
