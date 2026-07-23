/**
 * Phase 11D-A unit tests — allowlist gate · spoof · kill · shell streak · CONNECTED writers.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  PHASE11D_A_BADGE_READ_WIRING,
  PHASE11D_A_CACHE_WRITE,
  PHASE11D_A_CANARY_ALLOWLIST_USER_IDS,
  PHASE11D_A_LEGACY_DELETE,
  PHASE11D_A_NOTIFICATION_WRITE,
  PHASE11D_A_OWNER_SURFACE_EXPOSURE,
  PHASE11D_A_PERCENT_ROLLOUT,
  PHASE11D_A_PRODUCTION_HOME_WIRING,
  PHASE11D_A_READ_WRITE,
  PHASE11D_A_REALTIME_APPLY,
  assertPhase11dALayerContract,
  buildPhase11dALayerMatrix,
  getPhase11dAShadowPassStreak,
  isPhase11dAShellDisplayAllowed,
  killPhase11dACanary,
  recordPhase11dAShadowPass,
  resetPhase11dACanaryKillForTests,
  resolvePhase11dACanaryAccess,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import { executePhase11dAKill } from "@/lib/messenger/contracts/phase11da-canary-runtime";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";
import { PHASE11C5_ATOMIC_READ_RUNTIME_PASS } from "@/lib/messenger/contracts/phase11c5-cutover-layer-state";

const CANARY = PHASE11D_A_CANARY_ALLOWLIST_USER_IDS[0];
const OTHER = "00000000-0000-4000-8000-000000000099";

afterEach(() => {
  resetPhase11dACanaryKillForTests();
});

describe("Phase 11D-A — layer / writers (CONNECTED allowlist)", () => {
  it("Domain Authority stack CONNECTED; legacy delete / percent / all-user atomic pass OFF", () => {
    expect(PHASE11D_A_CACHE_WRITE).toBe(true);
    expect(PHASE11D_A_REALTIME_APPLY).toBe(true);
    expect(PHASE11D_A_BADGE_READ_WIRING).toBe(true);
    expect(PHASE11D_A_READ_WRITE).toBe(true);
    expect(PHASE11D_A_NOTIFICATION_WRITE).toBe(true);
    expect(PHASE11D_A_OWNER_SURFACE_EXPOSURE).toBe(true);
    expect(PHASE11D_A_LEGACY_DELETE).toBe(false);
    expect(PHASE11D_A_PERCENT_ROLLOUT).toBe(false);
    expect(PHASE11D_A_PRODUCTION_HOME_WIRING).toBe(true);
    expect(PHASE11C5_ATOMIC_READ_RUNTIME_PASS).toBe(false);
    assertPhase11dALayerContract();

    const matrix = buildPhase11dALayerMatrix();
    const canaryRows = matrix.filter((r) => r.mode === "canary");
    expect(canaryRows.some((r) => r.layer === "cache_write")).toBe(true);
    expect(canaryRows.some((r) => r.layer === "realtime_apply")).toBe(true);
    expect(canaryRows.some((r) => r.layer === "badge_read")).toBe(true);
    expect(canaryRows.some((r) => r.layer === "read_write")).toBe(true);
    expect(canaryRows.some((r) => r.layer === "notification_write")).toBe(true);
    expect(canaryRows.some((r) => r.layer === "bootstrap_read")).toBe(true);
    expect(canaryRows.some((r) => r.layer === "shell_read")).toBe(true);
    expect(
      canaryRows.some((r) => r.domain === "store_order" && r.surface === "owner")
    ).toBe(false);
    expect(
      matrix
        .filter((r) => r.domain === "store_order" && r.surface === "owner")
        .every((r) => r.mode === "off")
    ).toBe(true);
  });

  it("phase order lists 11D-A", () => {
    expect(
      MESSENGER_DOMAIN_BUILD_PHASE_ORDER.some((p) => p.domain === "bootstrap_shell_canary_read_only_11da")
    ).toBe(true);
  });
});

describe("Phase 11D-A — allowlist auth access", () => {
  it("anonymous → 401", () => {
    const a = resolvePhase11dACanaryAccess({ authenticatedUserId: null });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.status).toBe(401);
  });

  it("all authenticated viewers → canary mode (all-user Domain Authority)", () => {
    const a = resolvePhase11dACanaryAccess({ authenticatedUserId: OTHER });
    expect(a).toEqual({
      ok: true,
      mode: "canary",
      viewerUserId: OTHER,
    });
  });

  it("historical allowlist viewer → ok canary", () => {
    const a = resolvePhase11dACanaryAccess({ authenticatedUserId: CANARY });
    expect(a).toEqual({ ok: true, mode: "canary", viewerUserId: CANARY });
  });

  it("viewer spoof ≠ auth → 403", () => {
    const a = resolvePhase11dACanaryAccess({
      authenticatedUserId: CANARY,
      requestedViewerUserId: OTHER,
    });
    expect(a.ok).toBe(false);
    if (!a.ok) {
      expect(a.status).toBe(403);
      expect(a.reason).toBe("spoof_viewer");
    }
  });

  it("store_order owner excluded", () => {
    const a = resolvePhase11dACanaryAccess({
      authenticatedUserId: CANARY,
      domain: "store_order",
      surfaceRole: "owner",
    });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe("owner_excluded");
  });

  it("non-allowlist store_order owner still excluded", () => {
    const a = resolvePhase11dACanaryAccess({
      authenticatedUserId: OTHER,
      domain: "store_order",
      surfaceRole: "owner",
    });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe("owner_excluded");
  });
});

describe("Phase 11D-A — shadow streak / kill", () => {
  it("shell display after 3 consecutive shadow pass only", () => {
    expect(isPhase11dAShellDisplayAllowed()).toBe(false);
    recordPhase11dAShadowPass(true);
    recordPhase11dAShadowPass(true);
    expect(isPhase11dAShellDisplayAllowed()).toBe(false);
    recordPhase11dAShadowPass(true);
    expect(isPhase11dAShellDisplayAllowed()).toBe(true);
    expect(getPhase11dAShadowPassStreak()).toBe(3);
    recordPhase11dAShadowPass(false);
    expect(isPhase11dAShellDisplayAllowed()).toBe(false);
  });

  it("kill stops shell and resets streak", () => {
    recordPhase11dAShadowPass(true);
    recordPhase11dAShadowPass(true);
    recordPhase11dAShadowPass(true);
    const k = executePhase11dAKill();
    expect(k.legacyRestored).toBe(true);
    expect(k.persistentCleanup).toBe("none");
    expect(isPhase11dAShellDisplayAllowed()).toBe(false);
    const a = resolvePhase11dACanaryAccess({ authenticatedUserId: CANARY });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe("killed");
    killPhase11dACanary("noop");
  });
});

describe("STEP1/STEP2 — readiness contracts", () => {
  it("home wiring ON; Domain Authority writers CONNECTED", () => {
    expect(PHASE11D_A_PRODUCTION_HOME_WIRING).toBe(true);
    expect(PHASE11D_A_CACHE_WRITE).toBe(true);
    expect(PHASE11D_A_REALTIME_APPLY).toBe(true);
    expect(PHASE11D_A_BADGE_READ_WIRING).toBe(true);
    expect(PHASE11D_A_NOTIFICATION_WRITE).toBe(true);
    expect(PHASE11D_A_READ_WRITE).toBe(true);
  });
});
