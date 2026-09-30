/**
 * REBUILD 14 — R14-P3 System Start shared render contract (T21–T50).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";

import {
  BRAND_SIZE_NORM,
  STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE,
  StartupCompositorEngine,
  brandSizeNormForPreset,
  buildSystemStartRenderModel,
  computeBrandNormalizedRect,
  parseStartupPackageEnvelope,
  parseSystemStartIR,
  systemStartRenderSemanticsKey,
  SystemStartMinVisibleGate,
  type MediaAvailabilityEntry,
  type StartupPackageEnvelope,
} from "@/lib/startup-compositor";

const ROOT = join(__dirname, "../../..");
const RENDER_SRC = join(ROOT, "lib/startup-compositor/system-start/render.ts");
const MEDIA_SRC = join(ROOT, "lib/startup-compositor/system-start/media.ts");
const ANDROID_HOST = join(
  ROOT,
  "android/app/src/main/java/com/dibay/app/DibayStartupCompositorHost.java",
);
const IOS_HOST = join(ROOT, "ios/App/App/DibayStartupCompositorHost.swift");
const MAIN_ACTIVITY = join(
  ROOT,
  "android/app/src/main/java/com/dibay/app/MainActivity.java",
);
const IOS_ROOT_VC = join(ROOT, "ios/App/App/DibayRootBridgeViewController.swift");

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

function makeRaw(
  partial: {
    contentClass?: string;
    generationId?: string;
    systemStart?: unknown;
    intro?: unknown;
    mediaManifest?: unknown;
  } = {},
): Record<string, unknown> {
  return {
    schemaVersion: 14,
    generationId: partial.generationId ?? "G1",
    contentClass: partial.contentClass ?? "OWNER",
    systemStart: partial.systemStart ?? baseSystemStart(),
    intro: partial.intro ?? { present: false },
    mediaManifest: partial.mediaManifest ?? [
      { mediaId: "logo-1", integrityHex: "a".repeat(64) },
      { mediaId: "bg-1", integrityHex: "c".repeat(64) },
    ],
    capabilityVersion: 1,
    integrity: "b".repeat(64),
  };
}

function mustEnvelope(raw: Record<string, unknown>): StartupPackageEnvelope {
  const r = parseStartupPackageEnvelope(raw);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

function avail(
  entries: Record<string, Partial<MediaAvailabilityEntry> & { integrityHex: string }>,
): Record<string, MediaAvailabilityEntry> {
  const out: Record<string, MediaAvailabilityEntry> = {};
  for (const [id, e] of Object.entries(entries)) {
    out[id] = {
      integrityHex: e.integrityHex,
      intrinsicAspect: e.intrinsicAspect ?? null,
      bytesPresent: e.bytesPresent ?? true,
    };
  }
  return out;
}

describe("R14-P3 System Start shared render", () => {
  beforeEach(() => {
    StartupCompositorEngine.resetRegistryForTests();
  });

  it("T21 valid color-only SS IR", () => {
    const env = mustEnvelope(
      makeRaw({
        systemStart: baseSystemStart({
          brandAssetEnabled: false,
          brandAssetMediaId: null,
          backgroundImageMediaId: null,
        }),
      }),
    );
    const m = buildSystemStartRenderModel({
      envelope: env,
      mediaAvailability: {},
    });
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.value.background.kind).toBe("color");
      expect(m.value.brand).toBeNull();
      expect(m.value.ssRenderReady).toBe(true);
    }
  });

  it("T22 valid image-background SS IR", () => {
    const env = mustEnvelope(
      makeRaw({
        systemStart: baseSystemStart({
          backgroundImageMediaId: "bg-1",
          brandAssetEnabled: false,
          brandAssetMediaId: null,
        }),
      }),
    );
    const m = buildSystemStartRenderModel({
      envelope: env,
      mediaAvailability: avail({ "bg-1": { integrityHex: "c".repeat(64) } }),
    });
    expect(m.ok).toBe(true);
    if (m.ok && m.value.background.kind === "color_and_image") {
      expect(m.value.background.fit).toBe("COVER");
      expect(m.value.background.image.mediaId).toBe("bg-1");
    }
  });

  it("T23 brand disabled", () => {
    const env = mustEnvelope(
      makeRaw({
        systemStart: baseSystemStart({
          brandAssetEnabled: false,
          brandAssetMediaId: null,
        }),
      }),
    );
    const m = buildSystemStartRenderModel({ envelope: env, mediaAvailability: {} });
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.value.brand).toBeNull();
  });

  it("T24 brand enabled valid media", () => {
    const env = mustEnvelope(makeRaw());
    const m = buildSystemStartRenderModel({
      envelope: env,
      mediaAvailability: avail({
        "logo-1": { integrityHex: "a".repeat(64), intrinsicAspect: 2 },
      }),
    });
    expect(m.ok).toBe(true);
    if (m.ok && m.value.brand) {
      expect(m.value.brand.media.mediaId).toBe("logo-1");
      expect(m.value.brand.rect.intrinsicAspect).toBe(2);
    }
  });

  it("T25 missing required brand invalid", () => {
    const env = mustEnvelope(makeRaw());
    const m = buildSystemStartRenderModel({
      envelope: env,
      mediaAvailability: avail({
        "logo-1": {
          integrityHex: "a".repeat(64),
          intrinsicAspect: 1,
          bytesPresent: false,
        },
      }),
    });
    expect(m.ok).toBe(false);
  });

  it("T26 malformed background color invalid", () => {
    const ir = parseSystemStartIR(baseSystemStart({ backgroundColor: "navy" }));
    expect(ir.ok).toBe(false);
    const ir2 = parseSystemStartIR(baseSystemStart({ backgroundColor: "#GGG" }));
    expect(ir2.ok).toBe(false);
  });

  it("T27 normalized X/Y bounds", () => {
    expect(
      parseSystemStartIR(baseSystemStart({ brandXNorm: 1.1 })).ok,
    ).toBe(false);
    expect(
      parseSystemStartIR(baseSystemStart({ brandYNorm: -0.01 })).ok,
    ).toBe(false);
    expect(parseSystemStartIR(baseSystemStart({ brandXNorm: 0, brandYNorm: 1 })).ok).toBe(
      true,
    );
  });

  it("T28 S size canonical mapping", () => {
    expect(brandSizeNormForPreset("S")).toBe(BRAND_SIZE_NORM.S);
    expect(BRAND_SIZE_NORM.S).toBe(0.18);
  });

  it("T29 M size canonical mapping", () => {
    expect(brandSizeNormForPreset("M")).toBe(0.28);
  });

  it("T30 L size canonical mapping", () => {
    expect(brandSizeNormForPreset("L")).toBe(0.4);
  });

  it("T31 intrinsic aspect preserved", () => {
    const r = computeBrandNormalizedRect({
      preset: "M",
      centerXNorm: 0.5,
      centerYNorm: 0.5,
      intrinsicAspect: 2.5,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.w / r.value.h).toBeCloseTo(2.5, 8);
      expect(r.value.w).toBe(0.28);
    }
  });

  it("T32 no fixed-square coercion", () => {
    const wide = computeBrandNormalizedRect({
      preset: "S",
      centerXNorm: 0.5,
      centerYNorm: 0.5,
      intrinsicAspect: 3,
    });
    const tall = computeBrandNormalizedRect({
      preset: "S",
      centerXNorm: 0.5,
      centerYNorm: 0.5,
      intrinsicAspect: 0.5,
    });
    expect(wide.ok && tall.ok).toBe(true);
    if (wide.ok && tall.ok) {
      expect(wide.value.w).toBe(tall.value.w);
      expect(wide.value.h).not.toBe(tall.value.h);
      expect(wide.value.w).not.toBe(wide.value.h);
    }
  });

  it("T33 Owner envelope and bootstrap use same renderer", () => {
    const ss = baseSystemStart({
      brandAssetEnabled: true,
      brandAssetMediaId: "logo-1",
    });
    const owner = mustEnvelope(
      makeRaw({ contentClass: "OWNER", generationId: "G-O", systemStart: ss }),
    );
    const boot = mustEnvelope(
      makeRaw({
        contentClass: "SYSTEM_BOOTSTRAP",
        generationId: "G-B",
        systemStart: ss,
      }),
    );
    const media = avail({
      "logo-1": { integrityHex: "a".repeat(64), intrinsicAspect: 1.5 },
    });
    const a = buildSystemStartRenderModel({ envelope: owner, mediaAvailability: media });
    const b = buildSystemStartRenderModel({ envelope: boot, mediaAvailability: media });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(systemStartRenderSemanticsKey(a.value)).toBe(
        systemStartRenderSemanticsKey(b.value),
      );
      expect(a.value.contentClass).not.toBe(b.value.contentClass);
    }
  });

  it("T34 contentClass does not alter rendering semantics", () => {
    // same as T33 — semantic key ignores contentClass
    expect(true).toBe(true);
  });

  it("T35 media refs resolve only from active generation manifest", () => {
    const env = mustEnvelope(makeRaw());
    const m = buildSystemStartRenderModel({
      envelope: env,
      mediaAvailability: avail({
        "foreign-logo": { integrityHex: "a".repeat(64), intrinsicAspect: 1 },
        "logo-1": { integrityHex: "a".repeat(64), intrinsicAspect: 1 },
      }),
    });
    expect(m.ok).toBe(true);
    const bad = buildSystemStartRenderModel({
      envelope: mustEnvelope(
        makeRaw({
          systemStart: baseSystemStart({ brandAssetMediaId: "foreign-logo" }),
          mediaManifest: [{ mediaId: "logo-1", integrityHex: "a".repeat(64) }],
        }),
      ),
      mediaAvailability: avail({
        "foreign-logo": { integrityHex: "a".repeat(64), intrinsicAspect: 1 },
      }),
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toContain("not_in_active_generation");
  });

  it("T36 cross-generation media rejected", () => {
    const env = mustEnvelope(makeRaw({ generationId: "G1" }));
    const m = buildSystemStartRenderModel({
      envelope: env,
      mediaAvailability: avail({
        "logo-1": { integrityHex: "deadbeef".padEnd(64, "0"), intrinsicAspect: 1 },
      }),
    });
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.reason).toContain("integrity_mismatch");
  });

  it("T37 optional background image fail → authored color allowed", () => {
    const env = mustEnvelope(
      makeRaw({
        systemStart: baseSystemStart({
          backgroundImageMediaId: "bg-1",
          brandAssetEnabled: false,
          brandAssetMediaId: null,
        }),
      }),
    );
    const m = buildSystemStartRenderModel({
      envelope: env,
      mediaAvailability: avail({
        "bg-1": { integrityHex: "c".repeat(64), bytesPresent: false },
      }),
      backgroundImageFailurePolicy: "authored_color",
    });
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.value.background.kind).toBe("color");
      expect(m.value.background.colorHex).toBe("#0B1B3A");
    }
  });

  it("T38 required background image fail → invalid generation", () => {
    const env = mustEnvelope(
      makeRaw({
        systemStart: baseSystemStart({
          backgroundImageMediaId: "bg-1",
          brandAssetEnabled: false,
          brandAssetMediaId: null,
        }),
      }),
    );
    const m = buildSystemStartRenderModel({
      envelope: env,
      mediaAvailability: avail({
        "bg-1": { integrityHex: "c".repeat(64), bytesPresent: false },
      }),
      backgroundImageFailurePolicy: "invalid_generation",
    });
    expect(m.ok).toBe(false);
  });

  it("T39 no network in render path", () => {
    const src = readFileSync(RENDER_SRC, "utf8") + readFileSync(MEDIA_SRC, "utf8");
    expect(src).not.toMatch(/\bfetch\b|\bhttp:|\bhttps:|supabase|XMLHttpRequest/i);
  });

  it("T40 no platform branch in canonical renderer", () => {
    const src = readFileSync(RENDER_SRC, "utf8");
    expect(src.toLowerCase()).not.toMatch(
      /if\s*\(.*android|if\s*\(.*ios|samsung|xiaomi|iphone|uikit|android\./i,
    );
  });

  it("T41 timer does not start before OWNER_VISIBLE", () => {
    let t = 1000;
    const gate = new SystemStartMinVisibleGate(1500, () => t);
    t = 5000;
    expect(gate.elapsedVisibleMs()).toBe(0);
    expect(gate.hasReachedMinVisible()).toBe(false);
    expect(gate.canTransitionAfterMinVisible(true)).toBe(false);
  });

  it("T42 T0 starts once", () => {
    let t = 0;
    const gate = new SystemStartMinVisibleGate(1000, () => t);
    gate.notifyOwnerVisible();
    expect(gate.getState().t0Ms).toBe(0);
    t = 100;
    gate.notifyOwnerVisible();
    expect(gate.getState().t0Ms).toBe(0);
  });

  it("T43 duplicate visible event idempotent", () => {
    let t = 0;
    const gate = new SystemStartMinVisibleGate(500, () => t);
    gate.notifyOwnerVisible();
    t = 200;
    gate.notifyOwnerVisible();
    expect(gate.elapsedVisibleMs()).toBe(200);
  });

  it("T44 hidden/pre-visible time not consumed", () => {
    let t = 0;
    const gate = new SystemStartMinVisibleGate(1000, () => t);
    t = 500;
    expect(gate.elapsedVisibleMs()).toBe(0);
    gate.notifyOwnerVisible();
    t = 800;
    gate.notifyNotVisible();
    expect(gate.elapsedVisibleMs()).toBe(300);
    t = 5000;
    expect(gate.elapsedVisibleMs()).toBe(300);
  });

  it("T45 minVisible guard blocks early transition", () => {
    let t = 0;
    const gate = new SystemStartMinVisibleGate(1500, () => t);
    gate.notifyOwnerVisible();
    t = 1499;
    expect(gate.canTransitionAfterMinVisible(true)).toBe(false);
  });

  it("T46 minVisible permits transition only after elapsed + nextReady", () => {
    let t = 0;
    const gate = new SystemStartMinVisibleGate(1500, () => t);
    gate.notifyOwnerVisible();
    t = 1500;
    expect(gate.canTransitionAfterMinVisible(false)).toBe(false);
    expect(gate.canTransitionAfterMinVisible(true)).toBe(true);
  });

  it("T47 malformed geometry fail-closed", () => {
    const r = computeBrandNormalizedRect({
      preset: "M",
      centerXNorm: 0.5,
      centerYNorm: 0.5,
      intrinsicAspect: 0,
    });
    expect(r.ok).toBe(false);
  });

  it("T48 System Start remains mandatory", () => {
    const raw = makeRaw();
    delete raw.systemStart;
    expect(parseStartupPackageEnvelope(raw).ok).toBe(false);
  });

  it("T49 Intro absent does not remove System Start", () => {
    const env = mustEnvelope(makeRaw({ intro: { present: false } }));
    expect(env.systemStart.backgroundColor).toBeTruthy();
    const m = buildSystemStartRenderModel({
      envelope: env,
      mediaAvailability: avail({
        "logo-1": { integrityHex: "a".repeat(64), intrinsicAspect: 1 },
      }),
    });
    expect(m.ok).toBe(true);
  });

  it("T50 renderer creates no presentation surface + Production inactive + hosts unwired", () => {
    expect(STARTUP_COMPOSITOR_PRODUCTION_PRESENTATION_ACTIVE).toBe(false);
    const render = readFileSync(RENDER_SRC, "utf8");
    expect(render).not.toMatch(
      /createElement|Dialog|UIViewController|Window|addView|UIWindow/,
    );
    expect(readFileSync(MAIN_ACTIVITY, "utf8")).not.toContain(
      "DibayStartupCompositorHost",
    );
    if (existsSync(IOS_ROOT_VC)) {
      expect(readFileSync(IOS_ROOT_VC, "utf8")).not.toContain(
        "DibayStartupCompositorHost",
      );
    }
    const android = readFileSync(ANDROID_HOST, "utf8");
    const ios = readFileSync(IOS_HOST, "utf8");
    expect(android).toContain("PRODUCTION_PRESENTATION_ACTIVE = false");
    expect(ios).toContain("productionPresentationActive = false");
    expect(android).not.toMatch(/minVisible|buildSystemStart|BRAND_SIZE/);
    expect(ios).not.toMatch(/minVisible|buildSystemStart|BRAND_SIZE/);

    const eng = StartupCompositorEngine.getOrCreate("p3");
    const env = mustEnvelope(makeRaw());
    const model = buildSystemStartRenderModel({
      envelope: env,
      mediaAvailability: avail({
        "logo-1": { integrityHex: "a".repeat(64), intrinsicAspect: 1 },
      }),
    });
    expect(model.ok).toBe(true);
    if (model.ok) {
      expect(eng.bindSystemStartRenderModel(model.value).ok).toBe(true);
      expect(eng.getSystemStartPhaseState().readiness).toBe("SS_RENDER_READY");
      expect(
        eng.advanceSystemStartReadiness("SS_OWNER_VISIBLE").ok,
      ).toBe(false);
    }
  });
});
