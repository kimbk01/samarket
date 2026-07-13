import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cmHomeCutoverStableBucket,
  cmHomeCutoverStateToDispatchRead,
  createLegacyCmHomeCutoverGateConfig,
  normalizeCmHomeCutoverAllowlist,
  normalizeCmHomeCutoverGateConfig,
  type CmHomeCutoverGateConfigV1,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-keys";
import {
  isUserInCmHomeCutoverCohort,
  resolveCmHomeCutoverEffectiveGate,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-resolver";
import {
  applyCmHomeCutoverGateRuntimeMeta,
  noteCmHomeCutoverNetworkSeed,
  peekCmHomeCutoverGate,
  resetCmHomeCutoverGateForTests,
  resolveCmHomeCutoverDispatchMode,
  resolveCmHomeCutoverReadSource,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-client";

function config(overrides: Partial<CmHomeCutoverGateConfigV1> = {}): CmHomeCutoverGateConfigV1 {
  return { ...createLegacyCmHomeCutoverGateConfig(), ...overrides };
}

function fakePeekState(roomIds: string[]) {
  const map = new Map(roomIds.map((id) => [id, {}]));
  return () => ({ rooms: { keys: () => map.keys() } });
}

/** effectiveState 를 client envelope meta 로 감싼다 (서버 resolver 출력 모사). */
function meta(gateVersion: number, effectiveState: string, kill = false, pillarScope = "all") {
  return { cmHomeCutoverGate: { schemaVersion: 1, gateVersion, effectiveState, kill, pillarScope } };
}

describe("cm-home-cutover-gate keys/normalize", () => {
  it("missing / malformed / schema mismatch / unknown state → LEGACY", () => {
    const legacy = createLegacyCmHomeCutoverGateConfig();
    expect(normalizeCmHomeCutoverGateConfig(null)).toEqual(legacy);
    expect(normalizeCmHomeCutoverGateConfig("x")).toEqual(legacy);
    expect(normalizeCmHomeCutoverGateConfig({})).toEqual(legacy);
    expect(normalizeCmHomeCutoverGateConfig({ schemaVersion: 999, state: "CANONICAL", gateVersion: 5 })).toEqual(legacy);
    expect(normalizeCmHomeCutoverGateConfig({ schemaVersion: 1, state: "WAT", gateVersion: 5 })).toEqual(legacy);
    expect(normalizeCmHomeCutoverGateConfig({ schemaVersion: 1, state: "CANONICAL", gateVersion: -1 })).toEqual(legacy);
  });

  it("valid config parses and clamps percent + dedupes allowlist", () => {
    const parsed = normalizeCmHomeCutoverGateConfig({
      schemaVersion: 1,
      gateVersion: 3,
      state: "canonical",
      kill: false,
      cohort: { percent: 250, allowlist: [" u1 ", "u1", "u2", ""] },
      pillarScope: "trade",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed.state).toBe("CANONICAL");
    expect(parsed.gateVersion).toBe(3);
    expect(parsed.cohort.percent).toBe(100);
    expect(parsed.cohort.allowlist).toEqual(["u1", "u2"]);
    expect(parsed.pillarScope).toBe("trade");
  });

  it("allowlist normalize trims and dedupes", () => {
    expect(normalizeCmHomeCutoverAllowlist([" a", "a", "b", 1, null])).toEqual(["a", "b"]);
  });

  it("state → dispatch/read mapping (forbidden combinations impossible)", () => {
    expect(cmHomeCutoverStateToDispatchRead("LEGACY")).toEqual({ dispatch: "legacy", read: "legacy" });
    expect(cmHomeCutoverStateToDispatchRead("SHADOW_ONLY")).toEqual({ dispatch: "shadow", read: "legacy" });
    expect(cmHomeCutoverStateToDispatchRead("CANONICAL")).toEqual({ dispatch: "shadow", read: "canonical" });
    expect(cmHomeCutoverStateToDispatchRead("DUAL")).toEqual({ dispatch: "shadow", read: "dual" });
  });

  it("stable bucket is deterministic per userId and in [0,100)", () => {
    const b = cmHomeCutoverStableBucket("user-123");
    expect(b).toBe(cmHomeCutoverStableBucket("user-123"));
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(100);
  });
});

describe("cm-home-cutover-gate resolver (server cohort)", () => {
  it("kill=true → LEGACY regardless of state/cohort", () => {
    const eff = resolveCmHomeCutoverEffectiveGate(
      config({ state: "CANONICAL", kill: true, gateVersion: 4, cohort: { percent: 100, allowlist: [] } }),
      "u1"
    );
    expect(eff.effectiveState).toBe("LEGACY");
    expect(eff.dispatch).toBe("legacy");
    expect(eff.read).toBe("legacy");
    expect(eff.kill).toBe(true);
    expect(eff.gateVersion).toBe(4);
  });

  it("state LEGACY → LEGACY", () => {
    expect(resolveCmHomeCutoverEffectiveGate(config({ state: "LEGACY" }), "u1").effectiveState).toBe("LEGACY");
  });

  it("missing userId → LEGACY", () => {
    const eff = resolveCmHomeCutoverEffectiveGate(
      config({ state: "CANONICAL", cohort: { percent: 100, allowlist: [] } }),
      null
    );
    expect(eff.effectiveState).toBe("LEGACY");
  });

  it("allowlist takes priority over percent", () => {
    const cfg = config({ state: "CANONICAL", cohort: { percent: 0, allowlist: ["vip"] } });
    expect(isUserInCmHomeCutoverCohort(cfg, "vip")).toBe(true);
    expect(resolveCmHomeCutoverEffectiveGate(cfg, "vip").effectiveState).toBe("CANONICAL");
    expect(resolveCmHomeCutoverEffectiveGate(cfg, "other").effectiveState).toBe("LEGACY");
  });

  it("percent 0 excludes everyone, 100 includes everyone", () => {
    expect(isUserInCmHomeCutoverCohort(config({ cohort: { percent: 0, allowlist: [] } }), "x")).toBe(false);
    expect(isUserInCmHomeCutoverCohort(config({ cohort: { percent: 100, allowlist: [] } }), "x")).toBe(true);
  });

  it("percent uses stable hash bucket", () => {
    const bucket = cmHomeCutoverStableBucket("edge-user");
    const cfgIn = config({ state: "DUAL", cohort: { percent: bucket + 1, allowlist: [] } });
    const cfgOut = config({ state: "DUAL", cohort: { percent: bucket, allowlist: [] } });
    expect(isUserInCmHomeCutoverCohort(cfgIn, "edge-user")).toBe(true);
    expect(isUserInCmHomeCutoverCohort(cfgOut, "edge-user")).toBe(false); // bucket < percent is strict
  });
});

describe("cm-home-cutover-gate client (version monotonic + seed + kill)", () => {
  beforeEach(() => resetCmHomeCutoverGateForTests());
  afterEach(() => resetCmHomeCutoverGateForTests());

  it("default snapshot is LEGACY (fail-closed)", () => {
    const s = peekCmHomeCutoverGate();
    expect(s.effectiveState).toBe("LEGACY");
    expect(resolveCmHomeCutoverDispatchMode()).toBe("legacy");
    expect(resolveCmHomeCutoverReadSource()).toBe("legacy");
  });

  it("gate-less response keeps current gate", () => {
    applyCmHomeCutoverGateRuntimeMeta(meta(2, "CANONICAL"));
    applyCmHomeCutoverGateRuntimeMeta({ somethingElse: true });
    expect(peekCmHomeCutoverGate().effectiveState).toBe("CANONICAL");
  });

  it("CANONICAL: dispatch shadow but read blocked until seedComplete", () => {
    applyCmHomeCutoverGateRuntimeMeta(meta(1, "CANONICAL"));
    expect(resolveCmHomeCutoverDispatchMode()).toBe("shadow");
    expect(resolveCmHomeCutoverReadSource()).toBe("legacy"); // seed not complete
    expect(peekCmHomeCutoverGate().seedComplete).toBe(false);
  });

  it("empty inbox seedComplete → read canonical", () => {
    applyCmHomeCutoverGateRuntimeMeta(meta(1, "CANONICAL"));
    noteCmHomeCutoverNetworkSeed({ source: "critical", appliedRoomIds: [], peekState: fakePeekState([]) });
    expect(peekCmHomeCutoverGate().seedComplete).toBe(true);
    expect(resolveCmHomeCutoverReadSource()).toBe("canonical");
  });

  it("partial room set → seedComplete false → read legacy", () => {
    applyCmHomeCutoverGateRuntimeMeta(meta(1, "CANONICAL"));
    noteCmHomeCutoverNetworkSeed({
      source: "full",
      appliedRoomIds: ["a", "b"],
      peekState: fakePeekState(["a"]),
    });
    expect(peekCmHomeCutoverGate().seedComplete).toBe(false);
    expect(resolveCmHomeCutoverReadSource()).toBe("legacy");
  });

  it("cache source never promotes seed", () => {
    applyCmHomeCutoverGateRuntimeMeta(meta(1, "CANONICAL"));
    noteCmHomeCutoverNetworkSeed({ source: "cache", appliedRoomIds: [], peekState: fakePeekState([]) });
    expect(peekCmHomeCutoverGate().seedComplete).toBe(false);
  });

  it("stale (lower) gateVersion is ignored", () => {
    applyCmHomeCutoverGateRuntimeMeta(meta(5, "CANONICAL"));
    applyCmHomeCutoverGateRuntimeMeta(meta(2, "LEGACY"));
    expect(peekCmHomeCutoverGate().effectiveState).toBe("CANONICAL");
    expect(peekCmHomeCutoverGate().gateVersion).toBe(5);
  });

  it("same version state conflict → LEGACY priority", () => {
    applyCmHomeCutoverGateRuntimeMeta(meta(3, "CANONICAL"));
    applyCmHomeCutoverGateRuntimeMeta(meta(3, "DUAL"));
    expect(peekCmHomeCutoverGate().effectiveState).toBe("LEGACY");
  });

  it("kill=true forces LEGACY and blocks lower-version canonical restore", () => {
    applyCmHomeCutoverGateRuntimeMeta(meta(4, "CANONICAL"));
    noteCmHomeCutoverNetworkSeed({ source: "full", appliedRoomIds: [], peekState: fakePeekState([]) });
    expect(resolveCmHomeCutoverReadSource()).toBe("canonical");

    applyCmHomeCutoverGateRuntimeMeta(meta(4, "LEGACY", true)); // kill same version
    expect(peekCmHomeCutoverGate().effectiveState).toBe("LEGACY");
    expect(peekCmHomeCutoverGate().kill).toBe(true);
    expect(resolveCmHomeCutoverReadSource()).toBe("legacy");

    // lower-version canonical must not restore
    applyCmHomeCutoverGateRuntimeMeta(meta(3, "CANONICAL"));
    expect(peekCmHomeCutoverGate().effectiveState).toBe("LEGACY");

    // strictly higher non-kill restores
    applyCmHomeCutoverGateRuntimeMeta(meta(5, "CANONICAL"));
    expect(peekCmHomeCutoverGate().effectiveState).toBe("CANONICAL");
    expect(peekCmHomeCutoverGate().kill).toBe(false);
    expect(resolveCmHomeCutoverReadSource()).toBe("legacy"); // must reseed
  });

  it("peer (BroadcastChannel) kill applies immediately", () => {
    applyCmHomeCutoverGateRuntimeMeta(meta(2, "CANONICAL"));
    noteCmHomeCutoverNetworkSeed({ source: "full", appliedRoomIds: [], peekState: fakePeekState([]) });
    expect(resolveCmHomeCutoverReadSource()).toBe("canonical");
    applyCmHomeCutoverGateRuntimeMeta(meta(2, "LEGACY", true), { fromPeer: true });
    expect(peekCmHomeCutoverGate().effectiveState).toBe("LEGACY");
    expect(resolveCmHomeCutoverReadSource()).toBe("legacy");
  });

  it("new higher version resets seed (must reseed for new generation)", () => {
    applyCmHomeCutoverGateRuntimeMeta(meta(1, "CANONICAL"));
    noteCmHomeCutoverNetworkSeed({ source: "full", appliedRoomIds: [], peekState: fakePeekState([]) });
    expect(resolveCmHomeCutoverReadSource()).toBe("canonical");
    applyCmHomeCutoverGateRuntimeMeta(meta(2, "DUAL"));
    expect(peekCmHomeCutoverGate().seedComplete).toBe(false);
    expect(resolveCmHomeCutoverReadSource()).toBe("legacy");
    noteCmHomeCutoverNetworkSeed({ source: "full", appliedRoomIds: [], peekState: fakePeekState([]) });
    expect(resolveCmHomeCutoverReadSource()).toBe("dual");
  });
});
