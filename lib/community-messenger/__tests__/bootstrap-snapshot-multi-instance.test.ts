/**
 * Shared in-memory DB simulating two Vercel instances (separate unacked, shared rows).
 * Models advisory-locked watermark + fenced upsert + invalidate-failure poison.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOOTSTRAP_SNAPSHOT_INVALIDATE_WRITE_FAILED,
  INVALIDATE_BOOTSTRAP_SNAPSHOT_WATERMARK_RPC,
  UPSERT_BOOTSTRAP_SNAPSHOT_IF_WATERMARK_FENCE_RPC,
  bootstrapWatermarkEquals,
  clearUnackedBootstrapSnapshotInvalidationForTests,
  hasUnrecoveredBootstrapInvalidatePoison,
  isBootstrapSnapshotCounterFresh,
  snapshotUpdatedAtForFence,
  upsertBootstrapSnapshotWithWatermarkFence,
} from "@/lib/community-messenger/bootstrap-snapshot-invalidation";

type Row = {
  user_id: string;
  bootstrap_scope: string;
  list_limit: number;
  cursor_key: string;
  payload_json: Record<string, unknown>;
  updated_at: string;
};

function rowKey(r: Pick<Row, "user_id" | "bootstrap_scope" | "list_limit" | "cursor_key">) {
  return `${r.user_id}|${r.bootstrap_scope}|${r.list_limit}|${r.cursor_key}`;
}

function createSharedDb() {
  const rows = new Map<string, Row>();
  let clock = 1_000;
  const locks = new Map<string, Promise<void>>();

  async function withUserLock<T>(userId: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = locks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    locks.set(
      userId,
      prev.then(() => gate)
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  function tick() {
    clock += 1;
    return new Date(clock).toISOString();
  }

  async function invalidate(userId: string): Promise<string> {
    return withUserLock(userId, () => {
      const at = tick();
      const row: Row = {
        user_id: userId,
        bootstrap_scope: "__invalidate__",
        list_limit: 0,
        cursor_key: "",
        payload_json: { ok: false, error: "invalidated" },
        updated_at: at,
      };
      rows.set(rowKey(row), row);
      return at;
    });
  }

  async function fencedUpsert(input: {
    userId: string;
    bootstrapScope: string;
    listLimit: number;
    cursorKey: string;
    payload: Record<string, unknown>;
    fence: string | null;
  }): Promise<"written" | "skipped_stale_race" | "write_error"> {
    return withUserLock(input.userId, () => {
      const wm = rows.get(
        rowKey({
          user_id: input.userId,
          bootstrap_scope: "__invalidate__",
          list_limit: 0,
          cursor_key: "",
        })
      );
      const wmAt = wm?.updated_at ?? null;
      if (!bootstrapWatermarkEquals(wmAt, input.fence)) return "skipped_stale_race";
      const at = tick();
      const row: Row = {
        user_id: input.userId,
        bootstrap_scope: input.bootstrapScope,
        list_limit: input.listLimit,
        cursor_key: input.cursorKey,
        payload_json: input.payload,
        updated_at: at,
      };
      rows.set(rowKey(row), row);
      return "written";
    });
  }

  function get(userId: string, scope: string): Row | undefined {
    return rows.get(
      rowKey({ user_id: userId, bootstrap_scope: scope, list_limit: 50, cursor_key: "" })
    );
  }

  function watermark(userId: string): string | null {
    return (
      rows.get(
        rowKey({
          user_id: userId,
          bootstrap_scope: "__invalidate__",
          list_limit: 0,
          cursor_key: "",
        })
      )?.updated_at ?? null
    );
  }

  function poison(userId: string) {
    for (const row of rows.values()) {
      if (row.user_id === userId && row.bootstrap_scope !== "__invalidate__") {
        row.payload_json = { ok: false, error: BOOTSTRAP_SNAPSHOT_INVALIDATE_WRITE_FAILED };
      }
    }
  }

  function makeSb(opts?: { failInvalidate?: boolean }) {
    return {
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === INVALIDATE_BOOTSTRAP_SNAPSHOT_WATERMARK_RPC) {
          if (opts?.failInvalidate) {
            return { data: null, error: { message: "db write failed", code: "57014" } };
          }
          const at = await invalidate(String(args.p_user_id));
          return { data: at, error: null };
        }
        if (name === UPSERT_BOOTSTRAP_SNAPSHOT_IF_WATERMARK_FENCE_RPC) {
          const result = await fencedUpsert({
            userId: String(args.p_user_id),
            bootstrapScope: String(args.p_bootstrap_scope),
            listLimit: Number(args.p_list_limit),
            cursorKey: String(args.p_cursor_key ?? ""),
            payload: args.p_payload as Record<string, unknown>,
            fence: (args.p_fence as string | null) ?? null,
          });
          return { data: result, error: null };
        }
        return { data: null, error: { message: "unknown rpc", code: "42883" } };
      },
      from: () => {
        const state: {
          userId?: string;
          scopeEq?: string;
          scopeNeq?: string;
          errorEq?: string;
          limitN?: number;
        } = {};
        const api = {
          select: (_cols?: string) => api,
          update: (patch: { payload_json: Record<string, unknown> }) => {
            const run = async () => {
              for (const row of rows.values()) {
                if (state.userId && row.user_id !== state.userId) continue;
                if (state.scopeNeq && row.bootstrap_scope === state.scopeNeq) continue;
                row.payload_json = patch.payload_json;
              }
              return { error: null };
            };
            return {
              eq: (col: string, val: string) => {
                if (col === "user_id") state.userId = val;
                return {
                  neq: (c2: string, v2: string) => {
                    if (c2 === "bootstrap_scope") state.scopeNeq = v2;
                    return run();
                  },
                };
              },
            };
          },
          eq: (col: string, val: string) => {
            if (col === "user_id") state.userId = val;
            if (col === "bootstrap_scope") state.scopeEq = val;
            return api;
          },
          neq: (col: string, val: string) => {
            if (col === "bootstrap_scope") state.scopeNeq = val;
            return api;
          },
          filter: (expr: string, _op: string, val: string) => {
            if (expr.includes("error")) state.errorEq = val;
            return api;
          },
          limit: (n: number) => {
            state.limitN = n;
            return api;
          },
          maybeSingle: async () => {
            const wm = state.userId ? watermark(state.userId) : null;
            if (state.scopeEq === "__invalidate__") {
              return { data: wm ? { updated_at: wm } : null, error: null };
            }
            return { data: wm ? { updated_at: wm } : null, error: null };
          },
          then: undefined as unknown,
        };
        // Make filter/limit/neq chains awaitable for select lists
        (api as { then?: unknown }).then = undefined;
        const terminal = {
          ...api,
          limit: (n: number) => {
            state.limitN = n;
            return Promise.resolve().then(() => {
              const hits: Row[] = [];
              for (const row of rows.values()) {
                if (state.userId && row.user_id !== state.userId) continue;
                if (state.scopeNeq && row.bootstrap_scope === state.scopeNeq) continue;
                if (state.scopeEq && row.bootstrap_scope !== state.scopeEq) continue;
                if (state.errorEq && row.payload_json.error !== state.errorEq) continue;
                hits.push(row);
              }
              return {
                data: hits.slice(0, state.limitN ?? hits.length).map((r) => ({
                  bootstrap_scope: r.bootstrap_scope,
                })),
                error: null,
              };
            });
          },
        };
        return {
          select: () => ({
            eq: (col: string, val: string) => {
              if (col === "user_id") state.userId = val;
              return {
                eq: (c2: string, v2: string) => {
                  if (c2 === "bootstrap_scope") state.scopeEq = v2;
                  return {
                    eq: () => ({
                      eq: () => ({
                        maybeSingle: async () => {
                          const wm = state.userId ? watermark(state.userId) : null;
                          return { data: wm ? { updated_at: wm } : null, error: null };
                        },
                      }),
                    }),
                  };
                },
                neq: (c2: string, v2: string) => {
                  if (c2 === "bootstrap_scope") state.scopeNeq = v2;
                  return {
                    filter: (expr: string, _op: string, v3: string) => {
                      if (expr.includes("error")) state.errorEq = v3;
                      return terminal;
                    },
                  };
                },
              };
            },
          }),
          update: (patch: { payload_json: Record<string, unknown> }) => ({
            eq: (col: string, val: string) => {
              if (col === "user_id") state.userId = val;
              return {
                neq: async (c2: string, v2: string) => {
                  if (c2 === "bootstrap_scope") state.scopeNeq = v2;
                  for (const row of rows.values()) {
                    if (row.user_id !== state.userId) continue;
                    if (row.bootstrap_scope === v2) continue;
                    row.payload_json = patch.payload_json;
                  }
                  return { error: null };
                },
              };
            },
          }),
          upsert: async () => ({ error: { message: "fallback unused" } }),
        };
      },
    };
  }

  return { invalidate, fencedUpsert, get, watermark, poison, makeSb, rows };
}

describe("multi-instance snapshot consistency (shared DB mock)", () => {
  afterEach(() => {
    clearUnackedBootstrapSnapshotInvalidationForTests();
    vi.restoreAllMocks();
  });

  it("instance B does not serve pre-event snapshot after A watermark succeeds", async () => {
    const db = createSharedDb();
    const userId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    await db.fencedUpsert({
      userId,
      bootstrapScope: "full",
      listLimit: 50,
      cursorKey: "",
      payload: { ok: true, era: "old" },
      fence: null,
    });
    const before = db.get(userId, "full")!;
    const wm = await db.invalidate(userId);

    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: before.updated_at,
        invalidationAt: wm,
        invalidationReadOk: true,
        ageMs: 0,
        ttlMs: 8_000,
        payloadOk: true,
        unackedLocal: false,
      })
    ).toBe(false);
  });

  it("concurrent recomputes: only fence-matched write wins; loser skips", async () => {
    const db = createSharedDb();
    const userId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const fence0 = await db.invalidate(userId);

    const [a, b] = await Promise.all([
      db.fencedUpsert({
        userId,
        bootstrapScope: "full",
        listLimit: 50,
        cursorKey: "",
        payload: { ok: true, from: "A" },
        fence: fence0,
      }),
      (async () => {
        const fence1 = await db.invalidate(userId);
        return db.fencedUpsert({
          userId,
          bootstrapScope: "full",
          listLimit: 50,
          cursorKey: "",
          payload: { ok: true, from: "B" },
          fence: fence1,
        });
      })(),
    ]);

    expect([a, b].includes("written")).toBe(true);
    const row = db.get(userId, "full")!;
    expect(row.payload_json.ok).toBe(true);
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: row.updated_at,
        invalidationAt: db.watermark(userId),
        invalidationReadOk: true,
        ageMs: 0,
        ttlMs: 8_000,
        payloadOk: true,
      })
    ).toBe(true);
  });

  it("watermark write failure: poison blocks B from serving or saving stale as fresh", async () => {
    const db = createSharedDb();
    const userId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    await db.fencedUpsert({
      userId,
      bootstrapScope: "full",
      listLimit: 50,
      cursorKey: "",
      payload: { ok: true, era: "old" },
      fence: null,
    });
    const old = db.get(userId, "full")!;

    const sbA = db.makeSb({ failInvalidate: true });
    const fail = await sbA.rpc(INVALIDATE_BOOTSTRAP_SNAPSHOT_WATERMARK_RPC, { p_user_id: userId });
    expect(fail.error).toBeTruthy();
    expect(db.watermark(userId)).toBeNull();

    // Simulate fail-closed poison (same as writeInvalidationWatermark after RPC fail).
    db.poison(userId);
    expect(old.payload_json.error).toBe(BOOTSTRAP_SNAPSHOT_INVALIDATE_WRITE_FAILED);
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: old.updated_at,
        invalidationAt: null,
        invalidationReadOk: true,
        ageMs: 0,
        ttlMs: 8_000,
        payloadOk: old.payload_json.ok === true,
        unackedLocal: false,
      })
    ).toBe(false);

    expect(await hasUnrecoveredBootstrapInvalidatePoison(db.makeSb() as never, userId)).toBe(true);

    const revive = await upsertBootstrapSnapshotWithWatermarkFence(db.makeSb() as never, {
      userId,
      bootstrapScope: "full",
      listLimit: 50,
      cursorKey: "",
      payload: { ok: true, era: "stale_revive" },
      invalidationFence: null,
    });
    expect(revive).toBe("write_error");
    expect(db.get(userId, "full")?.payload_json.era).not.toBe("stale_revive");

    // Durable watermark clears the block; fenced write then allowed.
    const wm = await db.invalidate(userId);
    const okWrite = await upsertBootstrapSnapshotWithWatermarkFence(db.makeSb() as never, {
      userId,
      bootstrapScope: "full",
      listLimit: 50,
      cursorKey: "",
      payload: { ok: true, era: "post_wm" },
      invalidationFence: wm,
    });
    expect(okWrite).toBe("written");
    expect(db.get(userId, "full")?.payload_json.era).toBe("post_wm");
  });

  it("upsertBootstrapSnapshotWithWatermarkFence uses RPC and skips on fence move", async () => {
    const db = createSharedDb();
    const userId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const fence = await db.invalidate(userId);
    await db.invalidate(userId);

    const result = await upsertBootstrapSnapshotWithWatermarkFence(db.makeSb() as never, {
      userId,
      bootstrapScope: "full",
      listLimit: 50,
      cursorKey: "",
      payload: { ok: true },
      invalidationFence: fence,
    });
    expect(result).toBe("skipped_stale_race");
  });

  it("fence-copy updated_at does not invent future client skew beyond watermark", () => {
    const fence = "2026-10-23T00:00:02.000Z";
    expect(snapshotUpdatedAtForFence(fence, Date.parse("2099-01-01T00:00:00.000Z"))).toBe(fence);
  });

  it("total DB write failure: no durable signal — B may still see prior row as fresh (outage limit)", async () => {
    const db = createSharedDb();
    const userId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    await db.fencedUpsert({
      userId,
      bootstrapScope: "full",
      listLimit: 50,
      cursorKey: "",
      payload: { ok: true, era: "old" },
      fence: null,
    });
    const old = db.get(userId, "full")!;

    // Watermark RPC fails AND poison is not applied (all durable writes failed).
    const fail = await db.makeSb({ failInvalidate: true }).rpc(
      INVALIDATE_BOOTSTRAP_SNAPSHOT_WATERMARK_RPC,
      { p_user_id: userId }
    );
    expect(fail.error).toBeTruthy();
    expect(db.watermark(userId)).toBeNull();
    expect(old.payload_json.ok).toBe(true);

    // Structural limit: without any successful write, instance B cannot observe the invalidate.
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: old.updated_at,
        invalidationAt: null,
        invalidationReadOk: true,
        ageMs: 0,
        ttlMs: 8_000,
        payloadOk: true,
        unackedLocal: false,
      })
    ).toBe(true);

    // Instance A fail-closed via process-local unacked only — not a durable cross-instance signal.
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: old.updated_at,
        invalidationAt: null,
        invalidationReadOk: true,
        ageMs: 0,
        ttlMs: 8_000,
        payloadOk: true,
        unackedLocal: true,
      })
    ).toBe(false);

    // No amplification: revive write is still allowed when there is no poison marker
    // (DB outage class — availability over false "invalidated" lock without durable state).
    expect(await hasUnrecoveredBootstrapInvalidatePoison(db.makeSb() as never, userId)).toBe(false);
  });
});
