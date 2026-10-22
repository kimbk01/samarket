import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearUnackedBootstrapSnapshotInvalidationForTests,
  isBootstrapSnapshotCounterFresh,
  snapshotUpdatedAtForFence,
} from "@/lib/community-messenger/bootstrap-snapshot-invalidation";

describe("bootstrap invalidation race contracts", () => {
  afterEach(() => {
    clearUnackedBootstrapSnapshotInvalidationForTests();
  });

  it("watermark alone makes older concrete rows not fresh", () => {
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: "2026-10-23T00:00:01.000Z",
        invalidationAt: "2026-10-23T00:00:02.000Z",
        invalidationReadOk: true,
        ageMs: 100,
        ttlMs: 8_000,
        payloadOk: true,
      })
    ).toBe(false);
  });

  it("recompute under watermark: row.updated_at >= watermark is fresh", () => {
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: "2026-10-23T00:00:03.000Z",
        invalidationAt: "2026-10-23T00:00:02.000Z",
        invalidationReadOk: true,
        ageMs: 100,
        ttlMs: 8_000,
        payloadOk: true,
      })
    ).toBe(true);
    const t = "2026-10-23T00:00:02.000Z";
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: t,
        invalidationAt: t,
        invalidationReadOk: true,
        ageMs: 100,
        ttlMs: 8_000,
        payloadOk: true,
      })
    ).toBe(true);
  });

  it("unackedLocal fails closed even if DB watermark looks old", () => {
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: "2026-10-23T00:00:09.000Z",
        invalidationAt: null,
        invalidationReadOk: true,
        ageMs: 0,
        ttlMs: 8_000,
        payloadOk: true,
        unackedLocal: true,
      })
    ).toBe(false);
  });

  it("watermark read error → never serve counter as fresh", () => {
    expect(
      isBootstrapSnapshotCounterFresh({
        rowUpdatedAt: "2026-10-23T00:00:09.000Z",
        invalidationAt: null,
        invalidationReadOk: false,
        ageMs: 0,
        ttlMs: 8_000,
        payloadOk: true,
      })
    ).toBe(false);
  });

  it("fallback fence-copy never advances past watermark with client future clock", () => {
    const fence = "2026-10-23T00:00:02.000Z";
    expect(snapshotUpdatedAtForFence(fence, Date.parse("2099-01-01T00:00:00.000Z"))).toBe(fence);
  });

  it("source: prefers fenced RPC helpers; no infinite retry", () => {
    const src = readFileSync("lib/community-messenger/bootstrap-snapshot-invalidation.ts", "utf8");
    expect(src).toMatch(/invalidate_cm_bootstrap_snapshot_watermark/);
    expect(src).toMatch(/upsert_cm_bootstrap_snapshot_if_watermark_fence/);
    expect(src).toMatch(/bootstrapSnapshotFenceStillHolds/);
    expect(src).not.toMatch(/while\s*\(\s*true/);
    expect(src).not.toMatch(/\.delete\(\s*\)/);
  });

  it("source: load paths re-check fence before return", () => {
    const full = readFileSync("lib/community-messenger/full-bootstrap-snapshot.ts", "utf8");
    const cm = readFileSync("lib/community-messenger/cm-bootstrap-snapshot.ts", "utf8");
    expect(full).toMatch(/bootstrapSnapshotFenceStillHolds/);
    expect(cm).toMatch(/bootstrapSnapshotFenceStillHolds/);
    expect(full).toMatch(/attempt < 2/);
    expect(cm).toMatch(/attempt < 2/);
  });
});
