/**
 * Measured request budget — watermark invalidation (prefer RPC, fallback upsert, no DELETE).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Op = { kind: "rpc" | "upsert" | "delete"; detail?: string };
const ops: Op[] = [];

/** When true, invalidate RPC succeeds (ops migration applied). */
let rpcApplied = false;

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    rpc: async (name: string) => {
      ops.push({ kind: "rpc", detail: name });
      if (rpcApplied) {
        return { data: "2026-10-23T00:00:00.000Z", error: null };
      }
      return {
        data: null,
        error: { message: "Could not find the function", code: "PGRST202" },
      };
    },
    from: () => ({
      upsert: async (row: { bootstrap_scope: string }) => {
        ops.push({ kind: "upsert", detail: row.bootstrap_scope });
        return { error: null };
      },
      delete: () => {
        ops.push({ kind: "delete" });
        return {
          eq: () => ({ neq: () => Promise.resolve({ error: null }) }),
        };
      },
    }),
  }),
}));

describe("snapshot request budget", () => {
  beforeEach(() => {
    ops.length = 0;
    rpcApplied = false;
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("message 1건 · peer 2: fallback = RPC probe 2 + watermark upsert 2 + DELETE 0", async () => {
    const { invalidateCmBootstrapSnapshotCache } = await import(
      "@/lib/community-messenger/cm-bootstrap-snapshot-cache"
    );
    const { invalidateFullBootstrapSnapshotCache } = await import(
      "@/lib/community-messenger/full-bootstrap-snapshot-cache"
    );
    const { flushBootstrapSnapshotInvalidationForTests } = await import(
      "@/lib/community-messenger/bootstrap-snapshot-invalidation"
    );

    const peers = ["u1aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "u2bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"];
    for (const id of peers) {
      invalidateCmBootstrapSnapshotCache(id);
      invalidateFullBootstrapSnapshotCache(id, "message_send");
    }
    await flushBootstrapSnapshotInvalidationForTests();

    expect(ops.filter((o) => o.kind === "rpc").length).toBe(2);
    expect(ops.filter((o) => o.kind === "upsert" && o.detail === "__invalidate__").length).toBe(2);
    expect(ops.filter((o) => o.kind === "delete").length).toBe(0);
  });

  it("읽음 1건 · 동일 유저 cm+full coalesce: probe 1 + upsert 1", async () => {
    const { invalidateCmBootstrapSnapshotCache } = await import(
      "@/lib/community-messenger/cm-bootstrap-snapshot-cache"
    );
    const { invalidateFullBootstrapSnapshotCache } = await import(
      "@/lib/community-messenger/full-bootstrap-snapshot-cache"
    );
    const { flushBootstrapSnapshotInvalidationForTests } = await import(
      "@/lib/community-messenger/bootstrap-snapshot-invalidation"
    );
    invalidateCmBootstrapSnapshotCache("u5eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    invalidateFullBootstrapSnapshotCache("u5eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", "mark_read");
    await flushBootstrapSnapshotInvalidationForTests();
    expect(ops.filter((o) => o.kind === "rpc").length).toBe(1);
    expect(ops.filter((o) => o.kind === "upsert" && o.detail === "__invalidate__").length).toBe(1);
    expect(ops.filter((o) => o.kind === "delete").length).toBe(0);
  });

  it("연속 50·100건 coalesce → 각 1회 write, 이벤트 종료 후 추가 요청 없음", async () => {
    const { bumpBootstrapSnapshotInvalidation, flushBootstrapSnapshotInvalidationForTests } =
      await import("@/lib/community-messenger/bootstrap-snapshot-invalidation");
    for (const n of [50, 100] as const) {
      ops.length = 0;
      const uid =
        n === 50
          ? "u3cccccccc-cccc-cccc-cccc-cccccccccccc"
          : "u4dddddddd-dddd-dddd-dddd-dddddddddddd";
      for (let i = 0; i < n; i += 1) bumpBootstrapSnapshotInvalidation(uid);
      await flushBootstrapSnapshotInvalidationForTests();
      expect(ops.filter((o) => o.kind === "rpc").length).toBe(1);
      expect(ops.filter((o) => o.kind === "upsert").length).toBe(1);
      expect(ops.filter((o) => o.kind === "delete").length).toBe(0);
      const after = ops.length;
      await flushBootstrapSnapshotInvalidationForTests();
      expect(ops.length).toBe(after);
    }
  });

  it("RPC 적용 시: invalidate RPC 1 · upsert 0 · DELETE 0", async () => {
    rpcApplied = true;
    const { bumpBootstrapSnapshotInvalidation, flushBootstrapSnapshotInvalidationForTests } =
      await import("@/lib/community-messenger/bootstrap-snapshot-invalidation");
    bumpBootstrapSnapshotInvalidation("u6ffffffff-ffff-ffff-ffff-ffffffffffff");
    await flushBootstrapSnapshotInvalidationForTests();
    expect(ops.filter((o) => o.kind === "rpc").length).toBe(1);
    expect(ops.filter((o) => o.kind === "upsert").length).toBe(0);
    expect(ops.filter((o) => o.kind === "delete").length).toBe(0);
  });
});
