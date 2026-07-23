/**
 * STEP 8–9 — Cutover / Legacy removal prep tests (all-user ON; delete forbidden).
 */
import { describe, expect, it } from "vitest";
import {
  PHASE11_CUTOVER_ALL_USER_ON_FORBIDDEN,
  PHASE11_LEGACY_DELETE_EXECUTE_FORBIDDEN,
  assertDomainCutoverPrepStillOff,
  buildDomainAuthorityCutoverReadyMatrix,
  listCutoverLayerOrder,
  listLegacyRemovalManifestCategories,
  listLegacyRemovalPrepCatalog,
  listPhase1CutoverStatesStillOff,
  snapshotPhase11dALayerMatrixForCutoverPrep,
} from "@/lib/messenger/contracts/domain-cutover-prep";
import {
  PHASE11C5_LAYER_CUTOVER_PRODUCTION_ON,
} from "@/lib/messenger/contracts/phase11c5-cutover-layer-state";
import {
  PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY,
  PHASE11D_A_LEGACY_DELETE,
  PHASE11D_A_PRODUCTION_HOME_WIRING,
  PHASE11D_A_REALTIME_APPLY,
} from "@/lib/messenger/contracts/phase11da-canary-gate";

describe("STEP8–9 Cutover / Legacy prep", () => {
  it("all-user Domain cutover ON; legacy delete remains forbidden; stack CONNECTED", () => {
    expect(PHASE11_CUTOVER_ALL_USER_ON_FORBIDDEN).toBe(false);
    expect(PHASE11D_A_ALL_USER_DOMAIN_AUTHORITY).toBe(true);
    expect(PHASE11_LEGACY_DELETE_EXECUTE_FORBIDDEN).toBe(true);
    expect(PHASE11C5_LAYER_CUTOVER_PRODUCTION_ON).toBe(false);
    expect(PHASE11D_A_PRODUCTION_HOME_WIRING).toBe(true);
    expect(PHASE11D_A_LEGACY_DELETE).toBe(false);
    expect(PHASE11D_A_REALTIME_APPLY).toBe(true);
    expect(() => assertDomainCutoverPrepStillOff()).not.toThrow();
  });

  it("ready matrix lists authorities CONNECTED; cutoverAllowedNow true except legacy_delete", () => {
    const matrix = buildDomainAuthorityCutoverReadyMatrix();
    for (const layer of [
      "cache",
      "realtime",
      "badge",
      "notification",
      "atomic_read",
      "owner_surface",
      "home_wiring",
    ] as const) {
      const row = matrix.find((r) => r.layer === layer);
      expect(row?.implementationReady).toBe(true);
      expect(row?.productFlagOn).toBe(true);
      expect(row?.cutoverAllowedNow).toBe(true);
    }
    expect(matrix.find((r) => r.layer === "legacy_delete")?.productFlagOn).toBe(false);
    expect(matrix.find((r) => r.layer === "legacy_delete")?.cutoverAllowedNow).toBe(false);
  });

  it("phase1 cutover OFF; legacy catalog listed without deleteNow; layer matrix canary", () => {
    expect(listPhase1CutoverStatesStillOff().every((s) => s.mode === "off")).toBe(true);
    const legacy = listLegacyRemovalPrepCatalog();
    expect(legacy.length).toBeGreaterThan(0);
    expect(legacy.every((e) => e.deleteNow === false)).toBe(true);
    expect(listCutoverLayerOrder()[0]).toBe("bootstrap_read");
    const snap = snapshotPhase11dALayerMatrixForCutoverPrep();
    expect(
      snap
        .filter(
          (s) =>
            s.layer === "realtime_apply" &&
            !(s.domain === "store_order" && s.surface === "owner")
        )
        .every((s) => s.mode === "canary")
    ).toBe(true);
    expect(
      snap
        .filter((s) => s.domain === "store_order" && s.surface === "owner")
        .every((s) => s.mode === "off")
    ).toBe(true);
  });

  it("Legacy Removal manifest categories cover audit buckets; deleteNow false", () => {
    const cats = listLegacyRemovalManifestCategories();
    const names = cats.map((c) => c.category);
    for (const required of [
      "Bootstrap",
      "Cache",
      "Realtime",
      "Badge",
      "Notification",
      "Read",
      "route fallback",
      "BroadcastChannel",
      "session/local storage",
      "React state patch",
      "API fallback",
    ]) {
      expect(names).toContain(required);
    }
  });
});
