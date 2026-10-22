import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  UPSERT_BOOTSTRAP_SNAPSHOT_IF_WATERMARK_FENCE_RPC,
} from "@/lib/community-messenger/bootstrap-snapshot-invalidation";

const snapshotRpcMock = vi.fn();
let fenceRpcResults: Array<"written" | "skipped_stale_race" | "write_error"> = [];
let invalidationReads: Array<{ status: "ok" | "error"; updatedAt: string | null }> = [];

vi.mock("@/lib/community-messenger/bootstrap-snapshot-invalidation", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/community-messenger/bootstrap-snapshot-invalidation")
  >("@/lib/community-messenger/bootstrap-snapshot-invalidation");
  const readBootstrapSnapshotInvalidationAt = vi.fn(async () => {
    if (invalidationReads.length === 0) return { status: "ok" as const, updatedAt: null };
    return invalidationReads.shift() ?? { status: "ok" as const, updatedAt: null };
  });
  return {
    ...actual,
    readBootstrapSnapshotInvalidationAt,
    // Re-bind so post-return fence check uses the mocked reader (not actual module binding).
    bootstrapSnapshotFenceStillHolds: async (
      sbAny: never,
      userId: string,
      fence: string | null
    ) => {
      const inv = await readBootstrapSnapshotInvalidationAt(sbAny, userId);
      if (inv.status === "error") return false;
      return actual.bootstrapWatermarkEquals(inv.updatedAt, fence);
    },
  };
});

vi.mock("@/lib/community-messenger/full-bootstrap-snapshot-assemble", () => ({
  parseFullBootstrapSnapshotRpcData: (data: unknown) => data,
  fullBootstrapSnapshotGateFromPayload: () => ({ ok: true as const }),
  assembleFullBootstrapFromSnapshotPayload: async () => ({ chats: [], groups: [] }),
  assembleCriticalBootstrapFromSnapshotPayload: async () => ({ chats: [], groups: [] }),
}));

vi.mock("@/lib/community-messenger/full-bootstrap-snapshot-hotpath-analysis", () => ({
  logFullBootstrapMonolithAnalysis: () => {},
  logFullBootstrapSnapshotRpcDesignOnce: () => {},
}));

vi.mock("@/lib/community-messenger/full-bootstrap-snapshot-regression-guard", () => ({
  evaluateFullBootstrapRegressionGuards: () => {},
}));

function makeSb() {
  return {
    rpc: async (name: string, _args?: unknown) => {
      if (name === UPSERT_BOOTSTRAP_SNAPSHOT_IF_WATERMARK_FENCE_RPC) {
        const next = fenceRpcResults.shift() ?? "written";
        return { data: next, error: null };
      }
      return snapshotRpcMock();
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
  };
}

describe("full bootstrap recompute invalidation fence", () => {
  beforeEach(() => {
    snapshotRpcMock.mockReset();
    fenceRpcResults = [];
    invalidationReads = [];
  });

  it("skips upsert when watermark moves during RPC, writes on retry", async () => {
    const { refreshFullBootstrapSnapshotFromRpc } = await import(
      "@/lib/community-messenger/full-bootstrap-snapshot"
    );
    // attempt1 fence t0 → skipped; attempt2 fence t1 → written + final hold t1
    invalidationReads = [
      { status: "ok", updatedAt: "t0" },
      { status: "ok", updatedAt: "t1" },
      { status: "ok", updatedAt: "t1" },
    ];
    fenceRpcResults = ["skipped_stale_race", "written"];
    snapshotRpcMock.mockResolvedValue({
      data: { ok: true, tier: "full", rooms: [] },
      error: null,
    });

    const out = await refreshFullBootstrapSnapshotFromRpc(
      makeSb() as never,
      "dddddddd-dddd-dddd-dddd-dddddddddddd",
      "full"
    );

    expect(out?.ok).toBe(true);
    expect(snapshotRpcMock).toHaveBeenCalledTimes(2);
  });

  it("returns null after max fence races — never returns stale payload as success", async () => {
    const { refreshFullBootstrapSnapshotFromRpc } = await import(
      "@/lib/community-messenger/full-bootstrap-snapshot"
    );
    invalidationReads = [
      { status: "ok", updatedAt: "t0" },
      { status: "ok", updatedAt: "t1" },
    ];
    fenceRpcResults = ["skipped_stale_race", "skipped_stale_race"];
    snapshotRpcMock.mockResolvedValue({
      data: { ok: true, tier: "full", rooms: [] },
      error: null,
    });

    const out = await refreshFullBootstrapSnapshotFromRpc(
      makeSb() as never,
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "full"
    );

    expect(out).toBeNull();
    expect(snapshotRpcMock).toHaveBeenCalledTimes(2);
  });

  it("writes on first attempt when fence is stable", async () => {
    const { refreshFullBootstrapSnapshotFromRpc } = await import(
      "@/lib/community-messenger/full-bootstrap-snapshot"
    );
    invalidationReads = [
      { status: "ok", updatedAt: "t0" },
      { status: "ok", updatedAt: "t0" },
    ];
    fenceRpcResults = ["written"];
    snapshotRpcMock.mockResolvedValue({
      data: { ok: true, tier: "critical", rooms: [] },
      error: null,
    });

    const out = await refreshFullBootstrapSnapshotFromRpc(
      makeSb() as never,
      "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      "critical"
    );

    expect(out?.ok).toBe(true);
    expect(snapshotRpcMock).toHaveBeenCalledTimes(1);
  });

  it("does not return payload when fence moves after write ack", async () => {
    const { refreshFullBootstrapSnapshotFromRpc } = await import(
      "@/lib/community-messenger/full-bootstrap-snapshot"
    );
    // attempt1: write ok, final hold fails; attempt2: write ok, hold ok
    invalidationReads = [
      { status: "ok", updatedAt: "t0" },
      { status: "ok", updatedAt: "t1" },
      { status: "ok", updatedAt: "t1" },
      { status: "ok", updatedAt: "t1" },
    ];
    fenceRpcResults = ["written", "written"];
    snapshotRpcMock.mockResolvedValue({
      data: { ok: true, tier: "full", rooms: [] },
      error: null,
    });

    const out = await refreshFullBootstrapSnapshotFromRpc(
      makeSb() as never,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "full"
    );

    expect(out?.ok).toBe(true);
    expect(snapshotRpcMock).toHaveBeenCalledTimes(2);
  });
});
