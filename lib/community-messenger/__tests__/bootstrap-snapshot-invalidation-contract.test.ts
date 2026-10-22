import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOOTSTRAP_SNAPSHOT_INVALIDATION_SCOPE,
  bumpBootstrapSnapshotInvalidation,
  clearUnackedBootstrapSnapshotInvalidationForTests,
  flushBootstrapSnapshotInvalidationForTests,
  hasUnackedBootstrapSnapshotInvalidation,
  isBootstrapSnapshotCounterFresh,
  readBootstrapSnapshotInvalidationAt,
} from "@/lib/community-messenger/bootstrap-snapshot-invalidation";
import { invalidateCmBootstrapSnapshotCache } from "@/lib/community-messenger/cm-bootstrap-snapshot-cache";
import { invalidateFullBootstrapSnapshotCache } from "@/lib/community-messenger/full-bootstrap-snapshot-cache";

type WatermarkUpsertRow = {
  bootstrap_scope: string;
  user_id: string;
  [key: string]: unknown;
};
const upsertMock = vi.fn(async (_row: WatermarkUpsertRow) => ({ error: null as null }));
const maybeSingleMock = vi.fn();
/** Default: RPC not applied → missing fn → PostgREST upsert fallback. */
const invalidateRpcMock = vi.fn(async (..._args: unknown[]) => ({
  data: null as null,
  error: { message: "Could not find the function", code: "PGRST202" },
}));

function deleteBuilder() {
  const chain: {
    eq: (c?: string, v?: unknown) => unknown;
    neq: (c?: string, v?: unknown) => unknown;
  } = {
    eq: () => chain,
    neq: () => Promise.resolve({ error: null }),
  };
  return chain;
}

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    rpc: (name: unknown, params?: unknown) => invalidateRpcMock(name, params),
    from: () => ({
      upsert: upsertMock,
      update: () => ({
        eq: () => ({
          neq: async () => ({ error: null }),
        }),
      }),
      delete: () => deleteBuilder(),
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: maybeSingleMock,
              }),
            }),
          }),
          neq: () => ({
            filter: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/community-messenger/full-bootstrap-snapshot-refresh", () => ({
  scheduleFullBootstrapSnapshotRefresh: vi.fn(),
}));

vi.mock("@/lib/community-messenger/cm-bootstrap-snapshot-refresh", () => ({
  scheduleCmBootstrapSnapshotRefresh: vi.fn(),
}));

describe("bootstrap snapshot invalidation contract", () => {
  afterEach(() => {
    upsertMock.mockReset();
    upsertMock.mockImplementation(async () => ({ error: null }));
    invalidateRpcMock.mockReset();
    invalidateRpcMock.mockImplementation(async () => ({
      data: null,
      error: { message: "Could not find the function", code: "PGRST202" },
    }));
    maybeSingleMock.mockReset();
    clearUnackedBootstrapSnapshotInvalidationForTests();
  });

  it("isBootstrapSnapshotCounterFresh rejects obsolete / ttl-stale / !ok / inv-read error", () => {
    const inv = "2026-10-23T00:00:10.000Z";
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: "2026-10-23T00:00:11.000Z",
        invalidationAt: inv,
        invalidationReadOk: true,
        ageMs: 100,
        ttlMs: 8_000,
        payloadOk: true,
      })
    ).toBe(true);
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: "2026-10-23T00:00:09.000Z",
        invalidationAt: inv,
        invalidationReadOk: true,
        ageMs: 100,
        ttlMs: 8_000,
        payloadOk: true,
      })
    ).toBe(false);
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: "2026-10-23T00:00:11.000Z",
        invalidationAt: inv,
        invalidationReadOk: false,
        ageMs: 100,
        ttlMs: 8_000,
        payloadOk: true,
      })
    ).toBe(false);
  });

  it("cm+full invalidate coalesce to one watermark upsert (no eager schedule)", async () => {
    const { scheduleFullBootstrapSnapshotRefresh } = await import(
      "@/lib/community-messenger/full-bootstrap-snapshot-refresh"
    );
    const { scheduleCmBootstrapSnapshotRefresh } = await import(
      "@/lib/community-messenger/cm-bootstrap-snapshot-refresh"
    );

    invalidateCmBootstrapSnapshotCache("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    invalidateFullBootstrapSnapshotCache("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "message_send");
    await flushBootstrapSnapshotInvalidationForTests();

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const row = upsertMock.mock.calls[0]?.[0];
    expect(row).toBeDefined();
    expect(row!.bootstrap_scope).toBe(BOOTSTRAP_SNAPSHOT_INVALIDATION_SCOPE);
    expect(row!.user_id).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(scheduleFullBootstrapSnapshotRefresh).not.toHaveBeenCalled();
    expect(scheduleCmBootstrapSnapshotRefresh).not.toHaveBeenCalled();
    expect(hasUnackedBootstrapSnapshotInvalidation("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).toBe(
      false
    );
  });

  it("100 sequential invalidate events for one user → one watermark write when drained once per turn", async () => {
    upsertMock.mockClear();
    for (let i = 0; i < 100; i += 1) {
      bumpBootstrapSnapshotInvalidation("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    }
    await flushBootstrapSnapshotInvalidationForTests();
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(hasUnackedBootstrapSnapshotInvalidation("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")).toBe(
      false
    );
  });

  it("watermark write failure retains unacked (not treated as success)", async () => {
    invalidateRpcMock.mockImplementation(async () => ({
      data: null,
      error: { message: "fail", code: "57014" },
    }));
    bumpBootstrapSnapshotInvalidation("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    await flushBootstrapSnapshotInvalidationForTests();
    expect(invalidateRpcMock.mock.calls.length).toBe(2);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(hasUnackedBootstrapSnapshotInvalidation("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")).toBe(
      true
    );
  });

  it("invalidate during in-flight watermark write is not dropped", async () => {
    let release = false;
    let entered = 0;
    upsertMock.mockImplementation(async () => {
      entered += 1;
      if (entered === 1) {
        while (!release) {
          await new Promise((r) => setTimeout(r, 5));
        }
      }
      return { error: null };
    });
    bumpBootstrapSnapshotInvalidation("cccccccc-cccc-cccc-cccc-cccccccccccc");
    await new Promise((r) => setTimeout(r, 30));
    expect(entered).toBe(1);
    bumpBootstrapSnapshotInvalidation("cccccccc-cccc-cccc-cccc-cccccccccccc");
    release = true;
    await flushBootstrapSnapshotInvalidationForTests();
    expect(entered).toBeGreaterThanOrEqual(2);
  });

  it("readBootstrapSnapshotInvalidationAt distinguishes error vs missing", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const err = await readBootstrapSnapshotInvalidationAt(
      {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: maybeSingleMock }),
                }),
              }),
            }),
          }),
        }),
      } as never,
      "dddddddd-dddd-dddd-dddd-dddddddddddd"
    );
    expect(err).toEqual({ status: "error" });

    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const miss = await readBootstrapSnapshotInvalidationAt(
      {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: maybeSingleMock }),
                }),
              }),
            }),
          }),
        }),
      } as never,
      "dddddddd-dddd-dddd-dddd-dddddddddddd"
    );
    expect(miss).toEqual({ status: "ok", updatedAt: null });
  });

  it("source: caches/read paths must not schedule refresh; must use fence", () => {
    const fullCache = readFileSync(
      join(process.cwd(), "lib/community-messenger/full-bootstrap-snapshot-cache.ts"),
      "utf8"
    );
    const cmCache = readFileSync(
      join(process.cwd(), "lib/community-messenger/cm-bootstrap-snapshot-cache.ts"),
      "utf8"
    );
    const full = readFileSync(
      join(process.cwd(), "lib/community-messenger/full-bootstrap-snapshot.ts"),
      "utf8"
    );
    const cm = readFileSync(join(process.cwd(), "lib/community-messenger/cm-bootstrap-snapshot.ts"), "utf8");
    expect(fullCache).not.toMatch(/scheduleFullBootstrapSnapshotRefresh/);
    expect(cmCache).not.toMatch(/scheduleCmBootstrapSnapshotRefresh/);
    expect(full).not.toMatch(/scheduleFullBootstrapSnapshotRefresh/);
    expect(cm).not.toMatch(/scheduleCmBootstrapSnapshotRefresh/);
    expect(full).toMatch(/invalidationFence/);
    expect(cm).toMatch(/invalidationFence/);
  });
});
