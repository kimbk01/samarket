/**
 * DIBAY INTRO — V3 Active + native Scene1 authority tests.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildActiveMetaFromReady,
  promoteReadyToActiveAuthority,
  INTRO_COMPATIBILITY_VERSION,
} from "@/lib/intro/device/activate-engine";
import type {
  IntroActiveMetaV1,
  IntroReadyMetaV1,
} from "@/lib/intro/device/local-store-paths";
import { INTRO_STORE_LAYOUT } from "@/lib/intro/device/local-store-paths";
import {
  fitContentRegion,
  mapFrameToDevice,
} from "@/lib/intro/geometry/responsive-mapping";
import { computeIntroDurationMs } from "@/lib/intro/timeline/compute-duration";

/**
 * V3 Samsung READY Pack lock fixtures — committed under lib/intro/fixtures.
 * NEVER read .tmp/ in CI: agent evidence dirs are not checked into git.
 */
const V3_FIXTURE_DIR = join(
  process.cwd(),
  "lib/intro/fixtures/v3-samsung-visible",
);
const V3_READY_PACK = join(V3_FIXTURE_DIR, "READY_PACK.json");
const V3_EXPECTED_SCENE1 = join(V3_FIXTURE_DIR, "EXPECTED_SCENE1.json");
const V3_SEALED_PNG = join(V3_FIXTURE_DIR, "sealed.png");

const LOCKED = {
  publishedRevisionId: "4b5cf115-3ede-45a6-b6dd-a255915a9158",
  packId: "2f4dbc7d-b6ce-416f-80eb-012ef9bad153",
  packIntegrity:
    "sha256:f2a017fdb59c0ce4fcdb744af7dc3bab8113ac1de07e911298b1bf42f11dcc36",
  sealedAssetId: "96994097-b73f-4a22-ba12-ac441d2493b1",
  sealedIntegrity:
    "sha256:f77fc27a1a5436e2bb27346700de1f21a727958181e1803bf99168f923229396",
} as const;

function sha256Hex(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

function readyFixture(): IntroReadyMetaV1 {
  return {
    status: "READY",
    publishedRevisionId: LOCKED.publishedRevisionId,
    packId: LOCKED.packId,
    packIntegrity: LOCKED.packIntegrity,
    sealedAssets: [
      {
        sealedAssetId: LOCKED.sealedAssetId,
        sealedIntegrity: LOCKED.sealedIntegrity,
        relativePackPath: `assets/${LOCKED.sealedAssetId}.png`,
        byteLength: 98,
      },
    ],
    promotedAt: "2026-09-29T00:00:00.000Z",
    activePointer: null,
  };
}

function activeMemoryStore(opts?: {
  ready?: IntroReadyMetaV1 | null;
  active?: IntroActiveMetaV1 | null;
  failActivate?: boolean;
}) {
  const ready = opts?.ready ?? null;
  let active = opts?.active ?? null;
  const failActivate = opts?.failActivate ?? false;
  return {
    get ready() {
      return ready;
    },
    get active() {
      return active;
    },
    async readReadyMeta() {
      return ready;
    },
    async readActiveMeta() {
      return active;
    },
    async promoteReadyToActive(meta: IntroActiveMetaV1) {
      if (failActivate) throw new Error("ACTIVATE_FAIL_FIXTURE");
      active = meta;
    },
  };
}

describe("V3 surface / anti-host", () => {
  it("native Active store + RuntimeController exist; Host remains burned", () => {
    expect(
      existsSync(
        "android/app/src/main/java/com/dibay/app/intro/DibayIntroAuthorityStore.java",
      ),
    ).toBe(true);
    expect(
      existsSync(
        "android/app/src/main/java/com/dibay/app/intro/DibayIntroRuntimeController.java",
      ),
    ).toBe(true);
    expect(
      existsSync(
        "android/app/src/main/java/com/dibay/app/intro/DibayIntroSceneSurface.java",
      ),
    ).toBe(true);
    expect(
      existsSync(
        "android/app/src/main/java/com/dibay/app/intro/DibayIntroPackModel.java",
      ),
    ).toBe(true);
    expect(
      existsSync(
        "android/app/src/main/java/com/dibay/app/intro/DibayIntroHostOwner.java",
      ),
    ).toBe(false);
    const main = readFileSync(
      "android/app/src/main/java/com/dibay/app/MainActivity.java",
      "utf8",
    );
    expect(main).toContain("tryStartDibayIntroFromActive");
    expect(main).toContain("introFirstFrameReady");
    expect(main).not.toContain("DibayIntroHost");
  });

  it("Call / Popup boundaries untouched by Intro runtime", () => {
    const runtime = readFileSync(
      "android/app/src/main/java/com/dibay/app/intro/DibayIntroRuntimeController.java",
      "utf8",
    );
    expect(runtime).not.toMatch(/Agora|CallKit|PushKit|NativeIncomingCall/);
  });
});

describe("V3 READY→ACTIVE atomicity", () => {
  it("promotes Ready to Active pointer without mutating Ready identity", async () => {
    const ready = readyFixture();
    const store = activeMemoryStore({ ready });
    const result = await promoteReadyToActiveAuthority({
      store,
      now: () => "2026-09-29T12:00:00.000Z",
    });
    expect(result.outcome).toBe("ACTIVATED");
    if (result.outcome !== "ACTIVATED") return;
    expect(result.active.packId).toBe(LOCKED.packId);
    expect(result.active.publishedRevisionId).toBe(LOCKED.publishedRevisionId);
    expect(result.active.packIntegrity).toBe(LOCKED.packIntegrity);
    expect(result.active.localPackPath).toBe(INTRO_STORE_LAYOUT.readyPack);
    expect(result.active.compatibilityVersion).toBe(INTRO_COMPATIBILITY_VERSION);
    expect(store.ready).toEqual(ready);
  });

  it("idempotent when Active already matches Ready", async () => {
    const ready = readyFixture();
    const active = buildActiveMetaFromReady(ready, "t0");
    const store = activeMemoryStore({ ready, active });
    const result = await promoteReadyToActiveAuthority({ store });
    expect(result.outcome).toBe("ALREADY_ACTIVE");
  });

  it("failed activation preserves previous Active", async () => {
    const ready = readyFixture();
    const prior = buildActiveMetaFromReady(
      {
        ...ready,
        packId: "old-pack",
        publishedRevisionId: "old-rev",
        packIntegrity: "sha256:old",
      },
      "t-old",
    );
    const store = activeMemoryStore({
      ready,
      active: prior,
      failActivate: true,
    });
    const result = await promoteReadyToActiveAuthority({ store });
    expect(result.outcome).toBe("ACTIVATE_FAILED");
    if (result.outcome !== "ACTIVATE_FAILED") return;
    expect(result.priorActivePreserved).toBe(true);
    expect(store.active?.packId).toBe("old-pack");
  });

  it("NO_READY returns without fabricating Active", async () => {
    const store = activeMemoryStore({ ready: null });
    const result = await promoteReadyToActiveAuthority({ store });
    expect(result.outcome).toBe("NO_READY");
    expect(store.active).toBeNull();
  });
});

describe("V3 Expected Scene1 from Samsung READY Pack", () => {
  it("local evidence pack identity + Scene1 semantics match lock", () => {
    expect(existsSync(V3_READY_PACK)).toBe(true);
    expect(existsSync(V3_EXPECTED_SCENE1)).toBe(true);
    expect(existsSync(V3_SEALED_PNG)).toBe(true);
    const packBytes = readFileSync(V3_READY_PACK);
    const pack = JSON.parse(packBytes.toString("utf8")) as {
      packId: string;
      publishedRevisionId: string;
      packIntegrity: string;
      document: {
        scenes: Array<{
          sceneId: string;
          durationMs: number;
          background: { type: string };
          transitionAfter: { type: string; durationMs: number } | null;
          layers: Array<{ type: string; visible: boolean; zIndex: number }>;
        }>;
      };
      assets: Array<{ sealedAssetId: string; sealedIntegrity: string }>;
    };
    // Pack file integrity as stored in V2 Ready (canonical payload may differ from pretty JSON).
    expect(pack.packId).toBe(LOCKED.packId);
    expect(pack.publishedRevisionId).toBe(LOCKED.publishedRevisionId);
    expect(pack.packIntegrity).toBe(LOCKED.packIntegrity);
    expect(pack.assets[0]?.sealedAssetId).toBe(LOCKED.sealedAssetId);
    expect(pack.assets[0]?.sealedIntegrity).toBe(LOCKED.sealedIntegrity);

    const scene1 = pack.document.scenes[0]!;
    expect(scene1.sceneId).toBe("7f57ffb0-7057-4171-b729-0e00b9a312e8");
    expect(scene1.durationMs).toBe(2000);
    expect(scene1.background.type).toBe("SOLID");
    expect(scene1.transitionAfter?.type).toBe("CUT");
    const types = scene1.layers.map((l) => l.type).sort();
    expect(types).toEqual(["CTA", "IMAGE", "LOGO", "TEXT"]);
    expect(scene1.layers.every((l) => l.visible)).toBe(true);

    const expected = JSON.parse(readFileSync(V3_EXPECTED_SCENE1, "utf8")) as {
      scene1: { content?: string; layers: Array<{ type: string }> };
      visibleDescription: { TEXT: string; CTA: string };
    };
    expect(expected.visibleDescription.TEXT).toContain("CUT A BROWSER QA TEXT");
    expect(expected.visibleDescription.CTA).toContain("시작하기");

    const sealed = readFileSync(V3_SEALED_PNG);
    expect(`sha256:${sha256Hex(sealed)}`).toBe(LOCKED.sealedIntegrity);
  });

  it("timeline uses authored durations (no fixed Android timeout substitute)", () => {
    const pack = JSON.parse(readFileSync(V3_READY_PACK, "utf8")) as {
      document: Parameters<typeof computeIntroDurationMs>[0];
    };
    // 2000 + CUT0 + 2500 + FADE300 + 3000 = 7800
    expect(computeIntroDurationMs(pack.document)).toBe(7800);
  });

  it("FIT geometry Gate B — positioned content uses min scale", () => {
    const region = fitContentRegion({ width: 1080, height: 2340 }, { w: 9, h: 16 });
    const scale = Math.min(1080 / 9, 2340 / 16);
    expect(region.RW).toBeCloseTo(9 * scale, 5);
    expect(region.RH).toBeCloseTo(16 * scale, 5);
    const rect = mapFrameToDevice(
      { x: 0.1, y: 0.2, w: 0.8, h: 0.45 },
      region,
    );
    expect(rect.vx).toBeCloseTo(region.OX + 0.1 * region.RW, 5);
    expect(rect.vw).toBeCloseTo(0.8 * region.RW, 5);
  });
});

describe("V3 FIRST_FRAME != COMPLETED contract in code", () => {
  it("RuntimeController separates FIRST_FRAME_READY from INTRO_COMPLETED", () => {
    const src = readFileSync(
      "android/app/src/main/java/com/dibay/app/intro/DibayIntroRuntimeController.java",
      "utf8",
    );
    expect(src).toContain("INTRO_FIRST_FRAME_READY");
    expect(src).toContain("INTRO_COMPLETED");
    expect(src).toContain("HOLD last authored frame until HOME_PRESENTATION_READY");
    expect(src).toContain("releaseToHome");
    expect(src).toMatch(/complete\("TIMELINE_COMPLETE"\)/);
  });

  it("splash keep uses introFirstFrameReady when session active", () => {
    const main = readFileSync(
      "android/app/src/main/java/com/dibay/app/MainActivity.java",
      "utf8",
    );
    expect(main).toContain("introSessionActive");
    expect(main).toContain("!introFirstFrameReady");
  });
});

describe("V3 fail-open / no-network Intro dependency", () => {
  it("RuntimeController does not call Live/Pack download/Supabase", () => {
    const src = readFileSync(
      "android/app/src/main/java/com/dibay/app/intro/DibayIntroRuntimeController.java",
      "utf8",
    );
    expect(src).not.toMatch(/HttpURLConnection|OkHttp|supabase|fetchLive|packRetrieval/i);
    expect(src).toContain("tryStartFromLocalActive");
    expect(src).toContain("INTRO_ABORTED");
  });

  it("SLIDE status: parser accepts; current Scene1 uses CUT/FADE only", () => {
    const packModel = readFileSync(
      "android/app/src/main/java/com/dibay/app/intro/DibayIntroPackModel.java",
      "utf8",
    );
    expect(packModel).toContain('"SLIDE"');
    const pack = JSON.parse(readFileSync(V3_READY_PACK, "utf8")) as {
      document: {
        scenes: Array<{ transitionAfter: { type: string } | null }>;
      };
    };
    const types = pack.document.scenes.map((s) => s.transitionAfter?.type ?? null);
    expect(types).toEqual(["CUT", "FADE", null]);
    expect(types.includes("SLIDE")).toBe(false);
  });

  it("GIF not manufactured into Production Scene1", () => {
    const pack = JSON.parse(readFileSync(V3_READY_PACK, "utf8")) as {
      assets: Array<{ mime: string; kind: string }>;
      document: { scenes: Array<{ layers: Array<{ type: string }> }> };
    };
    expect(pack.assets.every((a) => a.mime !== "image/gif")).toBe(true);
    expect(
      pack.document.scenes[0]!.layers.every((l) => l.type !== "GIF"),
    ).toBe(true);
  });
});
