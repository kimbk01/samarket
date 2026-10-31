import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 1-D — 내 차단 목록은 SSOT(`user_social_relations`) 1회만 읽는다. legacy `user_relationships` 조회 없음.
 * 판정: relation_type=blocked 이고 is_active 가 false 가 아닌 행만.
 */
const db = vi.hoisted(() => ({ tables: [] as string[], rows: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => {
      db.tables.push(table);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.or = async () => ({ data: db.rows, error: null });
      return chain;
    },
  }),
}));

import { listBlockedByMeIds } from "@/lib/community-messenger/social-relations";

describe("1-D listBlockedByMeIds", () => {
  beforeEach(() => {
    db.tables = [];
    db.rows = [];
  });

  it("SSOT 1회만 읽고 활성 차단만 돌려준다", async () => {
    db.rows = [
      { target_user_id: "a", is_active: true, relation_type: "blocked" },
      { target_user_id: "b", is_active: null, relation_type: "blocked" },
      { target_user_id: "c", is_active: false, relation_type: "blocked" },
      { target_user_id: "a", is_active: true, relation_type: "blocked" },
    ];
    const ids = await listBlockedByMeIds("me");
    expect(ids.sort()).toEqual(["a", "b"]);
    expect(db.tables).toEqual(["user_social_relations"]);
  });

  it("빈 사용자 id → 조회 없음", async () => {
    expect(await listBlockedByMeIds("  ")).toEqual([]);
    expect(db.tables).toEqual([]);
  });
});
