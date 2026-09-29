/**
 * DIBAY INTRO — V2 Live → Device READY automated matrix.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INTRO_FONT_SPEC_VERSION,
  INTRO_PACK_SCHEMA_VERSION,
  INTRO_PROTOCOL_VERSION,
  INTRO_RENDER_SPEC_VERSION,
  type IntroPackV1,
} from "@/lib/intro/contracts/pack";
import { ServerLiveStatus } from "@/lib/intro/contracts/status";
import { AppIntroLiveKind } from "@/lib/intro/db/authority";
import { evaluatePackCompatibility } from "@/lib/intro/device/compatibility";
import { INTRO_FONT_AUTHORITY } from "@/lib/intro/device/fonts";
import {
  INTRO_AUTHORITY_RELATIVE_ROOT,
  INTRO_STORE_LAYOUT,
} from "@/lib/intro/device/local-store-paths";
import {
  runIntroForegroundSync,
  type DeviceLiveFetchResult,
  type IntroAuthorityStore,
  type SyncDownloaders,
} from "@/lib/intro/device/sync-engine";
import { buildIntroPackV1, packIntegrityOf } from "@/lib/intro/pack/canonical";
import { packRelativeAssetPath } from "@/lib/intro/pack/paths";
import { createEmptyIntroDocument } from "@/lib/intro/document/factory";
import {
  LiveConflictError,
  LiveValidationError,
} from "@/lib/intro/live/errors";
import { mapsToDeviceNoLiveIntro } from "@/lib/intro/db/authority";

const V1_IDS = {
  publishedRevisionId: "4b5cf115-3ede-45a6-b6dd-a255915a9158",
  packId: "2f4dbc7d-b6ce-416f-80eb-012ef9bad153",
  packIntegrity:
    "sha256:f2a017fdb59c0ce4fcdb744af7dc3bab8113ac1de07e911298b1bf42f11dcc36",
  sealedAssetId: "96994097-b73f-4a22-ba12-ac441d2493b1",
  sealedIntegrity:
    "sha256:f77fc27a1a5436e2bb27346700de1f21a727958181e1803bf99168f923229396",
};

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeMinimalPack(overrides?: Partial<IntroPackV1>): IntroPackV1 {
  let doc = createEmptyIntroDocument({
    documentId: "doc-v2-test",
    title: "v2",
  });
  const assetBytes = new Uint8Array([1, 2, 3, 4, 5]);
  const sealedIntegrity = `sha256:${sha256Hex(assetBytes)}`;
  const sealedAssetId = "seal-asset-1";
  const mediaRefId = "media-ref-1";
  doc = {
    ...doc,
    scenes: [
      {
        sceneId: "scene-1",
        name: "Scene 1",
        durationMs: 2500,
        background: {
          type: "SOLID",
          color: { r: 0, g: 0, b: 0, a: 1 },
        },
        transitionAfter: { type: "FADE", durationMs: 300 },
        layers: [
          {
            layerId: "layer-img-1",
            type: "IMAGE",
            name: "img",
            visible: true,
            zIndex: 1,
            frame: { x: 0, y: 0, w: 1, h: 1 },
            mediaRefId,
          } as never,
        ],
      },
    ],
  };
  const assets = [
    {
      sealedAssetId,
      mediaRefId,
      mediaId: "media-1",
      runtimeArtifactId: "rt-1",
      runtimeIntegrity: sealedIntegrity,
      sealedIntegrity,
      kind: "IMAGE" as const,
      format: "png",
      mime: "image/png",
      width: 10,
      height: 10,
      byteLength: assetBytes.byteLength,
      relativePackPath: packRelativeAssetPath({ sealedAssetId, ext: "png" }),
      animationMetadata: null,
    },
  ];
  const pack = buildIntroPackV1({
    packId: "pack-v2-test",
    publishedRevisionId: "rev-v2-test",
    documentId: doc.documentId,
    sourceDraftVersion: 1,
    document: doc,
    assets,
  });
  return { ...pack, ...overrides, assets: overrides?.assets ?? assets };
}

function memoryStore(): IntroAuthorityStore & {
  ready: IntroPackV1 | null;
  readyMeta: import("@/lib/intro/device/local-store-paths").IntroReadyMetaV1 | null;
  candidateMeta: import("@/lib/intro/device/local-store-paths").IntroCandidateMetaV1 | null;
  candidatePack: Uint8Array | null;
  candidateAssets: Map<string, Uint8Array>;
  noLive: string | null;
  fontsOk: boolean;
} {
  const state = {
    ready: null as IntroPackV1 | null,
    readyMeta: null as import("@/lib/intro/device/local-store-paths").IntroReadyMetaV1 | null,
    candidateMeta: null as import("@/lib/intro/device/local-store-paths").IntroCandidateMetaV1 | null,
    candidatePack: null as Uint8Array | null,
    candidateAssets: new Map<string, Uint8Array>(),
    noLive: null as string | null,
    fontsOk: true,
  };
  const store: IntroAuthorityStore & typeof state = {
    ...state,
    async readReadyMeta() {
      return this.readyMeta;
    },
    async readCandidateMeta() {
      return this.candidateMeta;
    },
    async beginCandidate(meta) {
      this.candidateMeta = meta;
      this.candidatePack = null;
      this.candidateAssets = new Map();
    },
    async writeCandidatePackJson(bytes) {
      this.candidatePack = bytes;
    },
    async writeCandidateAsset({ relativePackPath, bytes }) {
      this.candidateAssets.set(relativePackPath, bytes);
    },
    async markCandidateFailed({ failureCode, meta }) {
      this.candidateMeta = { ...meta, status: "FAILED", failureCode };
    },
    async promoteCandidateToReady(meta) {
      this.readyMeta = meta;
      this.candidateMeta = null;
      this.candidatePack = null;
      this.candidateAssets = new Map();
    },
    async assertFontAuthority() {
      return this.fontsOk
        ? { ok: true as const }
        : { ok: false as const, missing: ["Pretendard-Regular.otf"] };
    },
    async recordNoLiveMarker(physicalLiveKind) {
      this.noLive = physicalLiveKind;
    },
    async clearNoLiveMarker() {
      this.noLive = null;
    },
  };
  return store;
}

describe("V2 surface files", () => {
  it("Set Live admin + device live routes exist", () => {
    expect(existsSync("app/api/admin/intro/live/set/route.ts")).toBe(true);
    expect(existsSync("app/api/admin/intro/live/disable/route.ts")).toBe(true);
    expect(existsSync("app/api/admin/intro/live/rollback/route.ts")).toBe(true);
    expect(existsSync("app/api/intro/device/live/route.ts")).toBe(true);
    expect(existsSync("lib/intro/live/service.ts")).toBe(true);
    expect(existsSync("lib/intro/device/sync-engine.ts")).toBe(true);
  });

  it("Admin Studio distinguishes PUBLISHED vs CURRENT LIVE", () => {
    const studio = readFileSync("components/admin/intro/IntroStudio.tsx", "utf8");
    expect(studio).toContain("data-intro-set-live");
    expect(studio).toContain("data-intro-set-live-confirm");
    expect(studio).toContain("앱에 적용");
    expect(studio).toContain("CURRENT LIVE");
    expect(studio).not.toContain("모든 기기 적용 완료");
  });

  it("Android + iOS local stores exist", () => {
    expect(
      existsSync(
        "android/app/src/main/java/com/dibay/app/intro/DibayIntroAuthorityStore.java",
      ),
    ).toBe(true);
    expect(
      existsSync(
        "android/app/src/main/java/com/dibay/app/intro/DibayIntroAuthorityPlugin.java",
      ),
    ).toBe(true);
    expect(existsSync("ios/App/App/Plugins/DibayIntroAuthorityStore.swift")).toBe(
      true,
    );
    expect(
      existsSync("ios/App/App/Plugins/DibayIntroAuthorityPlugin.swift"),
    ).toBe(true);
    const main = readFileSync(
      "android/app/src/main/java/com/dibay/app/MainActivity.java",
      "utf8",
    );
    expect(main).toContain("DibayIntroAuthorityPlugin");
    expect(INTRO_AUTHORITY_RELATIVE_ROOT).toBe("intro/authority/v1");
    expect(INTRO_STORE_LAYOUT.readyMeta).toBe("ready/meta.json");
  });

  it("Gate E font hashes locked + bundled", () => {
    expect(INTRO_FONT_AUTHORITY).toHaveLength(4);
    for (const f of INTRO_FONT_AUTHORITY) {
      expect(
        existsSync(`android/app/src/main/assets/intro/fonts/${f.assetId}`),
      ).toBe(true);
      const bytes = readFileSync(
        `android/app/src/main/assets/intro/fonts/${f.assetId}`,
      );
      expect(`sha256:${sha256Hex(bytes)}`).toBe(f.sha256);
    }
  });

  it("foreground sync host mounted; no Call/Popup coupling", () => {
    const host = readFileSync(
      "lib/intro/device/IntroForegroundSyncHost.tsx",
      "utf8",
    );
    expect(host).toContain("appStateChange");
    expect(host).not.toMatch(/CallKit|Agora|PushKit|AVAudioSession/);
    const tree = readFileSync(
      "components/layout/MainAppProviderTree.tsx",
      "utf8",
    );
    expect(tree).toContain("IntroForegroundSyncHost");
  });

  it("startup / MainActivity Intro rendering unchanged by V2 sync", () => {
    const main = readFileSync(
      "android/app/src/main/java/com/dibay/app/MainActivity.java",
      "utf8",
    );
    // Plugin registered, but no cold Intro render from Ready
    expect(main).not.toMatch(/promoteCandidateToReady|IntroReadyRenderer|renderIntroFromReady/);
  });
});

describe("V2 live kind mapping", () => {
  it("NEVER_CONFIGURED and NO_LIVE_INTRO map to device NO_LIVE_INTRO", () => {
    expect(mapsToDeviceNoLiveIntro(AppIntroLiveKind.NEVER_CONFIGURED)).toBe(
      true,
    );
    expect(mapsToDeviceNoLiveIntro(AppIntroLiveKind.NO_LIVE_INTRO)).toBe(true);
    expect(mapsToDeviceNoLiveIntro(AppIntroLiveKind.COMMITTED_LIVE)).toBe(
      false,
    );
  });

  it("NO_LIVE_INTRO ≠ FETCH_FAILURE", () => {
    expect(ServerLiveStatus.NO_LIVE_INTRO).not.toBe(
      ServerLiveStatus.FETCH_FAILURE,
    );
  });
});

describe("V2 compatibility", () => {
  it("accepts Pack V1 versions + declares GIF", () => {
    const pack = makeMinimalPack();
    expect(pack.schemaVersion).toBe(INTRO_PACK_SCHEMA_VERSION);
    expect(pack.protocolVersion).toBe(INTRO_PROTOCOL_VERSION);
    expect(pack.renderSpecVersion).toBe(INTRO_RENDER_SPEC_VERSION);
    expect(pack.fontSpecVersion).toBe(INTRO_FONT_SPEC_VERSION);
    expect(pack.compatibility.supportedMediaRuntimeFormats).toContain(
      "CANONICAL_ANIMATED_GIF",
    );
    expect(evaluatePackCompatibility(pack).ok).toBe(true);
  });

  it("rejects unknown schema", () => {
    const pack = makeMinimalPack({ schemaVersion: 99 as never });
    const d = evaluatePackCompatibility(pack);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe("UNKNOWN_SCHEMA");
  });
});

describe("V2 sync transaction", () => {
  it("READY only after complete verification", async () => {
    const pack = makeMinimalPack();
    const packBytes = new TextEncoder().encode(JSON.stringify(pack));
    const asset = pack.assets[0]!;
    const assetBytes = new Uint8Array(asset.byteLength).fill(7);
    // rebuild with matching integrity
    const sealedIntegrity = `sha256:${sha256Hex(assetBytes)}`;
    const assets = [{ ...asset, sealedIntegrity, runtimeIntegrity: sealedIntegrity, byteLength: assetBytes.byteLength }];
    const pack2 = buildIntroPackV1({
      packId: pack.packId,
      publishedRevisionId: pack.publishedRevisionId,
      documentId: pack.documentId,
      sourceDraftVersion: pack.sourceDraftVersion,
      document: pack.document,
      assets,
    });
    const pack2Bytes = new TextEncoder().encode(JSON.stringify(pack2));
    const store = memoryStore();
    const live: DeviceLiveFetchResult = {
      ok: true,
      kind: ServerLiveStatus.LIVE,
      publishedRevisionId: pack2.publishedRevisionId,
      packId: pack2.packId,
      packIntegrity: pack2.packIntegrity,
      packRetrievalUrl: "pack://json",
      sealedAssets: [
        {
          sealedAssetId: assets[0]!.sealedAssetId,
          sealedIntegrity,
          byteLength: assetBytes.byteLength,
          relativePackPath: assets[0]!.relativePackPath,
          retrievalUrl: "asset://1",
        },
      ],
    };
    const downloaders: SyncDownloaders = {
      async downloadBytes(url) {
        if (url === "pack://json") return pack2Bytes;
        if (url === "asset://1") return assetBytes;
        throw new Error("unknown");
      },
      sha256Hex: async (b) => sha256Hex(b),
    };
    const result = await runIntroForegroundSync({
      store,
      downloaders,
      fetchLive: async () => live,
    });
    expect(result.outcome).toBe("READY");
    if (result.outcome === "READY") {
      expect(result.ready.packId).toBe(pack2.packId);
      expect(result.ready.activePointer).toBeNull();
    }
  });

  it("wrong pack integrity → Candidate FAIL, prior Ready preserved", async () => {
    const store = memoryStore();
    store.readyMeta = {
      status: "READY",
      publishedRevisionId: "old-rev",
      packId: "old-pack",
      packIntegrity: "sha256:old",
      sealedAssets: [],
      promotedAt: "t0",
      activePointer: null,
    };
    const pack = makeMinimalPack();
    const packBytes = new TextEncoder().encode(JSON.stringify(pack));
    const result = await runIntroForegroundSync({
      store,
      downloaders: {
        downloadBytes: async () => packBytes,
        sha256Hex: async (b) => sha256Hex(b),
      },
      fetchLive: async () => ({
        ok: true,
        kind: ServerLiveStatus.LIVE,
        publishedRevisionId: pack.publishedRevisionId,
        packId: pack.packId,
        packIntegrity: "sha256:deadbeef",
        packRetrievalUrl: "pack://json",
        sealedAssets: [],
      }),
    });
    expect(result.outcome).toBe("CANDIDATE_FAILED");
    if (result.outcome === "CANDIDATE_FAILED") {
      expect(result.priorReadyPreserved).toBe(true);
    }
    expect(store.readyMeta?.packId).toBe("old-pack");
  });

  it("fetch failure does not erase Ready; NO_LIVE is distinct", async () => {
    const store = memoryStore();
    store.readyMeta = {
      status: "READY",
      publishedRevisionId: "old-rev",
      packId: "old-pack",
      packIntegrity: "sha256:old",
      sealedAssets: [],
      promotedAt: "t0",
      activePointer: null,
    };
    const fail = await runIntroForegroundSync({
      store,
      downloaders: {
        downloadBytes: async () => new Uint8Array(),
        sha256Hex: async (b) => sha256Hex(b),
      },
      fetchLive: async () => ({
        ok: false,
        kind: ServerLiveStatus.FETCH_FAILURE,
        message: "network",
      }),
    });
    expect(fail.outcome).toBe("FETCH_FAILURE");
    if (fail.outcome === "FETCH_FAILURE") {
      expect(fail.priorReadyPreserved).toBe(true);
    }
    expect(store.readyMeta?.packId).toBe("old-pack");

    const noLive = await runIntroForegroundSync({
      store,
      downloaders: {
        downloadBytes: async () => new Uint8Array(),
        sha256Hex: async (b) => sha256Hex(b),
      },
      fetchLive: async () => ({
        ok: true,
        kind: ServerLiveStatus.NO_LIVE_INTRO,
        physicalLiveKind: AppIntroLiveKind.NO_LIVE_INTRO,
      }),
    });
    expect(noLive.outcome).toBe("NO_LIVE");
    if (noLive.outcome === "NO_LIVE") {
      expect(noLive.priorReadyPreserved).toBe(true);
    }
    expect(store.noLive).toBe(AppIntroLiveKind.NO_LIVE_INTRO);
    expect(store.readyMeta?.packId).toBe("old-pack");
  });

  it("same Live idempotent ALREADY_READY", async () => {
    const store = memoryStore();
    store.readyMeta = {
      status: "READY",
      publishedRevisionId: "rev-a",
      packId: "pack-a",
      packIntegrity: "sha256:aaa",
      sealedAssets: [],
      promotedAt: "t0",
      activePointer: null,
    };
    const result = await runIntroForegroundSync({
      store,
      downloaders: {
        downloadBytes: async () => {
          throw new Error("should_not_download");
        },
        sha256Hex: async (b) => sha256Hex(b),
      },
      fetchLive: async () => ({
        ok: true,
        kind: ServerLiveStatus.LIVE,
        publishedRevisionId: "rev-a",
        packId: "pack-a",
        packIntegrity: "sha256:aaa",
        packRetrievalUrl: "pack://json",
        sealedAssets: [],
      }),
    });
    expect(result.outcome).toBe("ALREADY_READY");
  });

  it("font missing rejects READY", async () => {
    const pack = makeMinimalPack();
    const packBytes = new TextEncoder().encode(JSON.stringify(pack));
    const store = memoryStore();
    store.fontsOk = false;
    const result = await runIntroForegroundSync({
      store,
      downloaders: {
        downloadBytes: async () => packBytes,
        sha256Hex: async (b) => sha256Hex(b),
      },
      fetchLive: async () => ({
        ok: true,
        kind: ServerLiveStatus.LIVE,
        publishedRevisionId: pack.publishedRevisionId,
        packId: pack.packId,
        packIntegrity: pack.packIntegrity,
        packRetrievalUrl: "pack://json",
        sealedAssets: [],
      }),
    });
    expect(result.outcome).toBe("CANDIDATE_FAILED");
    if (result.outcome === "CANDIDATE_FAILED") {
      expect(result.failureCode).toBe("FONT_AUTHORITY_MISSING");
    }
  });
});

describe("V1 identity lock for V2", () => {
  it("preserves exact V1 production identity constants", () => {
    expect(V1_IDS.publishedRevisionId).toBe(
      "4b5cf115-3ede-45a6-b6dd-a255915a9158",
    );
    expect(V1_IDS.packId).toBe("2f4dbc7d-b6ce-416f-80eb-012ef9bad153");
    expect(V1_IDS.packIntegrity).toBe(
      "sha256:f2a017fdb59c0ce4fcdb744af7dc3bab8113ac1de07e911298b1bf42f11dcc36",
    );
    expect(V1_IDS.sealedAssetId).toBe(
      "96994097-b73f-4a22-ba12-ac441d2493b1",
    );
    // Committed V1 lock fixture — do not depend on gitignored .tmp evidence.
    const trace = JSON.parse(
      readFileSync("lib/intro/fixtures/v1-identity-trace.json", "utf8"),
    );
    expect(trace.publishedRevisionId).toBe(V1_IDS.publishedRevisionId);
    expect(trace.packId).toBe(V1_IDS.packId);
    expect(trace.packIntegrity).toBe(V1_IDS.packIntegrity);
  });
});

describe("V2 live error types", () => {
  it("validation vs conflict distinct", () => {
    expect(new LiveValidationError("REVISION_NOT_COMMITTED").code).toBe(
      "REVISION_NOT_COMMITTED",
    );
    expect(new LiveConflictError("LIVE_CAS_LOST").code).toBe("LIVE_CAS_LOST");
  });
});

describe("V2 historical quarantine", () => {
  it("device live route quarantines historical Intro", () => {
    const src = readFileSync("app/api/intro/device/live/route.ts", "utf8");
    expect(src).toContain("QUARANTINED");
    expect(src).toContain("mediaLibraryAuthority: false");
    expect(src).toContain("draftAuthority: false");
  });
});

void packIntegrityOf;
