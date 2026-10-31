import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 순서 3 — 「상대도 나를 친구로 저장했나」는 친구 수와 상관없이 1회(100명 단위) 조회.
 * 조건: target_user_id=나 · relation_type=friend · owner_user_id in (친구들). 오류 → 빈 집합(기존 사람별 오류 → false).
 */
const db = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; eq: Array<[string, unknown]>; in?: [string, string[]] }>,
  rows: [] as Array<Record<string, unknown>>,
  error: null as unknown,
}));

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => {
      const call = { table, eq: [] as Array<[string, unknown]>, in: undefined as [string, string[]] | undefined };
      db.calls.push(call);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, v: unknown) => {
        call.eq.push([col, v]);
        return chain;
      };
      chain.in = async (col: string, ids: string[]) => {
        call.in = [col, ids];
        return {
          data: db.error ? null : db.rows.filter((r) => ids.includes(String(r.owner_user_id))),
          error: db.error,
        };
      };
      return chain;
    },
  }),
}));

import { listOwnersWhoSavedTargetAsFriend } from "@/lib/community-messenger/social-relations";

describe("순서 3 listOwnersWhoSavedTargetAsFriend", () => {
  beforeEach(() => {
    db.calls = [];
    db.rows = [];
    db.error = null;
  });

  it("친구 13명이어도 1회 조회 · 나를 저장한 사람만", async () => {
    const peers = Array.from({ length: 13 }, (_, i) => `p${i}`);
    db.rows = [{ owner_user_id: "p1" }, { owner_user_id: "p7" }];
    const out = await listOwnersWhoSavedTargetAsFriend("me", peers);
    expect([...out].sort()).toEqual(["p1", "p7"]);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].table).toBe("user_social_relations");
    expect(db.calls[0].eq).toEqual([
      ["target_user_id", "me"],
      ["relation_type", "friend"],
    ]);
    expect(db.calls[0].in?.[0]).toBe("owner_user_id");
    expect(db.calls[0].in?.[1]).toEqual(peers);
  });

  it("중복·빈 값·나 자신 제외, 250명은 100명 단위 3회", async () => {
    const peers = [...Array.from({ length: 250 }, (_, i) => `p${i}`), "p0", " ", "me"];
    db.rows = [{ owner_user_id: "p249" }];
    const out = await listOwnersWhoSavedTargetAsFriend("me", peers);
    expect([...out]).toEqual(["p249"]);
    expect(db.calls.map((c) => c.in?.[1].length)).toEqual([100, 100, 50]);
  });

  it("친구 없음 → 조회 없음", async () => {
    expect((await listOwnersWhoSavedTargetAsFriend("me", [])).size).toBe(0);
    expect((await listOwnersWhoSavedTargetAsFriend(" ", ["p1"])).size).toBe(0);
    expect(db.calls).toHaveLength(0);
  });

  it("조회 오류 → 빈 집합 (기존 사람별 오류 → false 와 같음)", async () => {
    db.error = { message: "boom" };
    db.rows = [{ owner_user_id: "p1" }];
    expect((await listOwnersWhoSavedTargetAsFriend("me", ["p1"])).size).toBe(0);
  });
});
