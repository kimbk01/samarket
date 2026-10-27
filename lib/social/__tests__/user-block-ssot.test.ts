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

  it("checks legacy with merged user_blocks when SSOT clear (3 REST, was 4)", async () => {
    const { sb, calls } = createCountingSb({
      socialRows: [],
      relRows: [],
      blockRows: [{ user_id: "u2", blocked_user_id: "u1" }],
    });
    const rel = await fetchBlockedPairFromSb(sb, "u1", "u2");
    expect(rel).toEqual({ blockedByMe: false, blockedByPeer: true, blockedEitherWay: true });
    expect(calls.map((c) => c.table).sort()).toEqual(
      ["user_blocks", "user_relationships", "user_social_relations"].sort()
    );
    expect(calls.filter((c) => c.table === "user_blocks")).toHaveLength(1);
  });

  it("does not treat inactive SSOT row as block — still reads legacy", async () => {
    const { sb, calls } = createCountingSb({
      socialRows: [{ owner_user_id: "u1", relation_type: "blocked", is_active: false }],
      relRows: [{ user_id: "u1" }],
      blockRows: [],
    });
    const rel = await fetchBlockedPairFromSb(sb, "u1", "u2");
    expect(rel.blockedByMe).toBe(true);
    expect(calls.some((c) => c.table === "user_relationships")).toBe(true);
    expect(calls.some((c) => c.table === "user_blocks")).toBe(true);
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
