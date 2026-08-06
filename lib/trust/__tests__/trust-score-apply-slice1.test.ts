import { describe, expect, it, vi } from "vitest";
import { applyTrustScoreDelta } from "@/lib/trust/trust-score-apply";

type Row = { trust_score?: number };

function createFakeSb(store: Map<string, Row>) {
  const logs: Array<Record<string, unknown>> = [];
  const sb = {
    from(table: string) {
      if (table === "reputation_logs") {
        return {
          select() {
            return {
              eq() {
                return {
                  gte() {
                    return {
                      eq: async () => ({ data: [], error: null }),
                    };
                  },
                };
              },
            };
          },
          insert: async (row: Record<string, unknown>) => {
            logs.push(row);
            return { data: null, error: null };
          },
        };
      }
      if (table === "profiles") {
        return {
          select() {
            return {
              eq(col: string, id: string) {
                expect(col).toBe("id");
                return {
                  maybeSingle: async () => ({
                    data: store.get(id) ?? null,
                    error: null,
                  }),
                };
              },
            };
          },
          update(patch: Row) {
            return {
              eq: async (col: string, id: string) => {
                expect(col).toBe("id");
                const prev = store.get(id) ?? {};
                store.set(id, { ...prev, ...patch });
                return { data: null, error: null };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { sb: sb as never, logs };
}

describe("Slice1 applyTrustScoreDelta writer + isolation", () => {
  it("writes reputation_logs admin_adjust and updates only target user", async () => {
    const store = new Map<string, Row>([
      ["user-a", { trust_score: 50 }],
      ["user-b", { trust_score: 77 }],
    ]);
    const { sb, logs } = createFakeSb(store);

    await applyTrustScoreDelta(sb, {
      userId: "user-a",
      sourceType: "admin_adjust",
      baseDelta: 5,
      skipDailyCap: true,
      reason: "slice1_test",
      metadata: { admin_user_id: "admin-1" },
    });

    expect(store.get("user-a")?.trust_score).toBe(55);
    expect(store.get("user-b")?.trust_score).toBe(77);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.user_id).toBe("user-a");
    expect(logs[0]?.source_type).toBe("admin_adjust");
    expect(logs[0]?.status).toBe("applied");
    expect(logs[0]?.reason).toBe("slice1_test");
  });

  it("no-ops when userId empty (no cross-user write)", async () => {
    const store = new Map<string, Row>([["user-a", { trust_score: 50 }]]);
    const insert = vi.fn();
    const sb = {
      from() {
        return { insert, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), update: () => ({ eq: insert }) };
      },
    };
    await applyTrustScoreDelta(sb as never, {
      userId: "  ",
      sourceType: "admin_adjust",
      baseDelta: 1,
    });
    expect(insert).not.toHaveBeenCalled();
    expect(store.get("user-a")?.trust_score).toBe(50);
  });
});
