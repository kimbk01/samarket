import { describe, expect, it } from "vitest";
import {
  canBecomeActiveProductGeneration,
  createEmptyAuthorityState,
  establishBootstrapSeed,
  parseCtaAction,
  parseNormalizedFrame,
  parseStartupPackageEnvelope,
  promoteStagingIfValid,
  resolveColdActive,
  stageGeneration,
  validateMotionToken,
  validateTransitionToken,
  wouldBootstrapReactivateAfterOwner,
  type GenerationAuthorityState,
  type StartupPackageEnvelope,
} from "@/lib/startup-compositor";
import { STARTUP_TRANSITIONS } from "@/lib/startup-compositor/state-machine";

function baseSystemStart(overrides: Record<string, unknown> = {}) {
  return {
    backgroundColor: "#0B1B3A",
    backgroundImageMediaId: null,
    brandAssetEnabled: true,
    brandAssetMediaId: "logo-1",
    brandSizePreset: "M",
    brandXNorm: 0.5,
    brandYNorm: 0.45,
    minVisibleMs: 1500,
    ...overrides,
  };
}

function makeEnvelope(
  partial: Partial<{
    contentClass: string;
    generationId: string;
    systemStart: unknown;
    intro: unknown;
    integrity: string;
  }> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 14,
    generationId: partial.generationId ?? "G1",
    contentClass: partial.contentClass ?? "OWNER",
    systemStart: partial.systemStart ?? baseSystemStart(),
    intro: partial.intro ?? { present: false },
    mediaManifest: [
      {
        mediaId: "logo-1",
        integrityHex: "a".repeat(64),
      },
    ],
    capabilityVersion: 1,
    integrity: partial.integrity ?? "b".repeat(64),
  };
}

describe("R14-P1 StartupPackageEnvelope v14", () => {
  it("accepts valid OWNER envelope", () => {
    const r = parseStartupPackageEnvelope(makeEnvelope({ contentClass: "OWNER" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.contentClass).toBe("OWNER");
      expect(r.value.schemaVersion).toBe(14);
    }
  });

  it("accepts valid SYSTEM_BOOTSTRAP envelope", () => {
    const r = parseStartupPackageEnvelope(
      makeEnvelope({ contentClass: "SYSTEM_BOOTSTRAP", generationId: "BOOTSTRAP-1" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.contentClass).toBe("SYSTEM_BOOTSTRAP");
  });

  it("rejects System Start missing", () => {
    const raw = makeEnvelope();
    delete raw.systemStart;
    const r = parseStartupPackageEnvelope(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("system_start_missing");
  });

  it("accepts Intro absent", () => {
    const r = parseStartupPackageEnvelope(
      makeEnvelope({ intro: { present: false } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.intro.present).toBe(false);
  });

  it("accepts Intro present with document", () => {
    const r = parseStartupPackageEnvelope(
      makeEnvelope({
        intro: { present: true, document: { scenes: [] } },
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok && r.value.intro.present) {
      expect(r.value.intro.document).toEqual({ scenes: [] });
    }
  });

  it("rejects Intro present without document", () => {
    const r = parseStartupPackageEnvelope(
      makeEnvelope({ intro: { present: true } }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("R14-P1 generation authority", () => {
  it("QA cannot be active product generation", () => {
    expect(canBecomeActiveProductGeneration("QA")).toBe(false);
    expect(canBecomeActiveProductGeneration("OWNER")).toBe(true);
    expect(canBecomeActiveProductGeneration("SYSTEM_BOOTSTRAP")).toBe(false);
  });

  it("bootstrap → Owner promotion semantics", () => {
    let state = createEmptyAuthorityState();
    const boot = establishBootstrapSeed(state, {
      generationId: "BOOTSTRAP-1",
      contentClass: "SYSTEM_BOOTSTRAP",
      integrityHex: "c".repeat(64),
    });
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;
    state = boot.next;
    expect(state.ownerAuthorityEverEstablished).toBe(false);
    expect(state.active?.contentClass).toBe("SYSTEM_BOOTSTRAP");

    state = stageGeneration(state, {
      generationId: "G10",
      contentClass: "OWNER",
      integrityHex: "d".repeat(64),
    });
    const promo = promoteStagingIfValid(state, { integrityOk: true });
    expect(promo.ok).toBe(true);
    if (!promo.ok) return;
    expect(promo.next.ownerAuthorityEverEstablished).toBe(true);
    expect(promo.next.active?.generationId).toBe("G10");
    expect(promo.next.active?.contentClass).toBe("OWNER");
  });

  it("Owner Gn + failed Gn+1 keeps Gn", () => {
    let state = createEmptyAuthorityState();
    state = {
      ownerAuthorityEverEstablished: true,
      active: { generationId: "G10", contentClass: "OWNER" },
      verifiedHistory: [
        {
          generationId: "G10",
          contentClass: "OWNER",
          integrityHex: "e".repeat(64),
        },
      ],
      staging: null,
    };
    state = stageGeneration(state, {
      generationId: "G11",
      contentClass: "OWNER",
      integrityHex: "f".repeat(64),
    });
    const fail = promoteStagingIfValid(state, { integrityOk: false });
    expect(fail.ok).toBe(false);
    expect(fail.next.active?.generationId).toBe("G10");
    expect(fail.next.staging).toBeNull();
  });

  it("bootstrap cannot reactivate after Owner established", () => {
    const state = {
      ownerAuthorityEverEstablished: true,
      active: { generationId: "G10", contentClass: "OWNER" as const },
      verifiedHistory: [] as const,
      staging: null,
    };
    expect(wouldBootstrapReactivateAfterOwner(state)).toBe(true);
    const again = establishBootstrapSeed(state, {
      generationId: "BOOTSTRAP-OLD",
      contentClass: "SYSTEM_BOOTSTRAP",
      integrityHex: "1".repeat(64),
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("bootstrap_reactivation_forbidden");
  });

  it("corrupted active Owner at cold is FATAL not bootstrap", () => {
    const state = {
      ownerAuthorityEverEstablished: true,
      active: { generationId: "G10", contentClass: "OWNER" as const },
      verifiedHistory: [],
      staging: null,
    };
    const cold = resolveColdActive({
      state,
      activeIntegrityOk: false,
      bootstrapSeedAvailable: true,
    });
    expect(cold.kind).toBe("FATAL_OWNER_LOCAL_CORRUPTION");
  });

  it("QA staging cannot promote", () => {
    let state = createEmptyAuthorityState();
    state = stageGeneration(state, {
      generationId: "QA1",
      contentClass: "QA",
      integrityHex: "2".repeat(64),
    });
    const r = promoteStagingIfValid(state, { integrityOk: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("QA");
  });

  it("no mixed generation authority after failed promote", () => {
    let state: GenerationAuthorityState = {
      ownerAuthorityEverEstablished: true,
      active: { generationId: "G10", contentClass: "OWNER" },
      verifiedHistory: [
        {
          generationId: "G10",
          contentClass: "OWNER",
          integrityHex: "3".repeat(64),
        },
      ],
      staging: null,
    };
    state = stageGeneration(state, {
      generationId: "G11",
      contentClass: "OWNER",
      integrityHex: "4".repeat(64),
    });
    const fail = promoteStagingIfValid(state, { integrityOk: false });
    expect(fail.next.active?.generationId).toBe("G10");
    expect(
      fail.next.verifiedHistory.some((g) => g.generationId === "G11"),
    ).toBe(false);
  });
});

describe("R14-P1 registries / geometry / SM", () => {
  it("unsupported motion fail-closed", () => {
    expect(validateMotionToken({ type: "SPIN_WILD" }).ok).toBe(false);
    expect(validateMotionToken({ type: "SLIDE_LEFT", startMs: 0, durationMs: 200 }).ok).toBe(
      false,
    );
    expect(validateMotionToken({ type: "FADE_IN", startMs: 0, durationMs: 300 }).ok).toBe(
      true,
    );
  });

  it("transition token validation", () => {
    expect(validateTransitionToken({ type: "FADE", durationMs: 400 }).ok).toBe(true);
    expect(validateTransitionToken({ type: "NOPE", durationMs: 1 }).ok).toBe(false);
  });

  it("CTA destination validation", () => {
    expect(parseCtaAction({ type: "FINISH_INTRO" }).ok).toBe(true);
    expect(
      parseCtaAction({ type: "INTERNAL_DESTINATION", destination: "trade" }).ok,
    ).toBe(true);
    expect(
      parseCtaAction({ type: "INTERNAL_DESTINATION", destination: "/hack" }).ok,
    ).toBe(false);
  });

  it("normalized geometry validation", () => {
    expect(parseNormalizedFrame({ x: 0.1, y: 0.1, w: 0.5, h: 0.2 }).ok).toBe(true);
    expect(parseNormalizedFrame({ x: 0.8, y: 0.8, w: 0.5, h: 0.5 }).ok).toBe(false);
  });

  it("state machine has no ss_absent_valid", () => {
    const blob = JSON.stringify(STARTUP_TRANSITIONS);
    expect(blob).not.toContain("ss_absent");
    expect(STARTUP_TRANSITIONS.some((t) => t.to === "START_VISIBLE")).toBe(true);
  });

  it("parsed OWNER envelope type shape", () => {
    const r = parseStartupPackageEnvelope(makeEnvelope());
    expect(r.ok).toBe(true);
    if (r.ok) {
      const e: StartupPackageEnvelope = r.value;
      expect(e.generationId).toBe("G1");
    }
  });
});
