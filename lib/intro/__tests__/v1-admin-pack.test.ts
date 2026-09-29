/**
 * DIBAY INTRO — VERTICAL RECOVERY V1
 * Admin → Pack automated coverage.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_INTRO_FIXTURE_DOCUMENT,
  createEmptyIntroDocument,
} from "@/lib/intro";
import { addLayer as addLayerMut } from "@/lib/intro/document/mutations";
import {
  INTRO_FONT_SPEC_VERSION,
  INTRO_PACK_SCHEMA_VERSION,
  INTRO_PROTOCOL_VERSION,
  INTRO_RENDER_SPEC_VERSION,
  INTRO_TIMELINE_SPEC_VERSION,
} from "@/lib/intro/contracts/pack";
import { GifRuntimeFormat } from "@/lib/intro/contracts/gif";
import {
  AppIntroPublishOpStatus,
  AppIntroLiveKind,
  AppIntroStorageSubspace,
  APP_INTRO_STORAGE_BUCKET,
} from "@/lib/intro/db/authority";
import { collectAuthoredMediaRefIds } from "@/lib/intro/publish/collect-media";
import {
  assetSetIntegrityOf,
  buildIntroPackV1,
  documentDigestOf,
  packIntegrityOf,
  parseIntroPackV1,
  packSummaryForReport,
} from "@/lib/intro/pack/canonical";
import { auditNativeConsumability } from "@/lib/intro/pack/consumability";
import {
  buildPackManifestStoragePath,
  buildSealedStoragePath,
  packRelativeAssetPath,
} from "@/lib/intro/pack/paths";
import { validatePublish, validatePackManifest } from "@/lib/intro/validation/core";
import { integrityOf } from "@/lib/intro/media/integrity";

describe("V1 Pack contract freeze", () => {
  it("locks schema/protocol/render/font/timeline versions at 1", () => {
    expect(INTRO_PACK_SCHEMA_VERSION).toBe(1);
    expect(INTRO_PROTOCOL_VERSION).toBe(1);
    expect(INTRO_RENDER_SPEC_VERSION).toBe(1);
    expect(INTRO_FONT_SPEC_VERSION).toBe(1);
    expect(INTRO_TIMELINE_SPEC_VERSION).toBe(1);
  });

  it("uses canonical dibay-intro authority namespaces only", () => {
    expect(APP_INTRO_STORAGE_BUCKET).toBe("dibay-intro");
    expect(AppIntroStorageSubspace.SEALED).toBe("authority/v1/sealed/");
    expect(AppIntroStorageSubspace.PACKS).toBe("authority/v1/packs/");
    expect(buildSealedStoragePath({
      publishedRevisionId: "rev-1",
      sealedAssetId: "seal-1",
      ext: "png",
    })).toBe("authority/v1/sealed/rev-1/seal-1/runtime.png");
    expect(buildPackManifestStoragePath("pack-1")).toBe(
      "authority/v1/packs/pack-1/pack.json",
    );
  });

  it("publish state machine constants are locked", () => {
    expect(AppIntroPublishOpStatus.PREPARING).toBe("PREPARING");
    expect(AppIntroPublishOpStatus.READY_TO_COMMIT).toBe("READY_TO_COMMIT");
    expect(AppIntroPublishOpStatus.COMMITTED).toBe("COMMITTED");
    expect(AppIntroPublishOpStatus.FAILED).toBe("FAILED");
  });
});

describe("V1 Pack build + integrity", () => {
  const fixtureDoc = CANONICAL_INTRO_FIXTURE_DOCUMENT;
  const assets = [
    {
      sealedAssetId: "seal-logo",
      mediaRefId: "fixture-media-ref-logo",
      mediaId: "fixture-media-ref-logo",
      runtimeArtifactId: "rt-logo",
      runtimeIntegrity: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sealedIntegrity: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      kind: "LOGO" as const,
      format: "image/png",
      mime: "image/png",
      width: 100,
      height: 100,
      byteLength: 12,
      relativePackPath: packRelativeAssetPath({ sealedAssetId: "seal-logo", ext: "png" }),
      animationMetadata: null,
    },
    {
      sealedAssetId: "seal-gif",
      mediaRefId: "fixture-media-ref-gif-05",
      mediaId: "fixture-media-ref-gif-05",
      runtimeArtifactId: "rt-gif",
      runtimeIntegrity: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sealedIntegrity: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      kind: "GIF" as const,
      format: GifRuntimeFormat.CANONICAL_ANIMATED_GIF,
      mime: "image/gif",
      width: 64,
      height: 64,
      byteLength: 40,
      relativePackPath: packRelativeAssetPath({ sealedAssetId: "seal-gif", ext: "gif" }),
      animationMetadata: { animated: true, loopCount: 0 },
    },
  ];

  it("builds deterministic pack integrity for same inputs", () => {
    const a = buildIntroPackV1({
      packId: "pack-a",
      publishedRevisionId: "rev-a",
      documentId: fixtureDoc.documentId,
      sourceDraftVersion: 2,
      document: fixtureDoc,
      assets,
    });
    const b = buildIntroPackV1({
      packId: "pack-a",
      publishedRevisionId: "rev-a",
      documentId: fixtureDoc.documentId,
      sourceDraftVersion: 2,
      document: fixtureDoc,
      assets: [...assets].reverse(),
    });
    expect(a.packIntegrity).toBe(b.packIntegrity);
    expect(a.assetSetIntegrity).toBe(assetSetIntegrityOf(assets));
    expect(a.documentIntegrity.documentDigest).toBe(documentDigestOf(fixtureDoc));
    expect(parseIntroPackV1(a).packId).toBe("pack-a");
  });

  it("changes pack integrity when document changes", () => {
    const a = buildIntroPackV1({
      packId: "pack-a",
      publishedRevisionId: "rev-a",
      documentId: fixtureDoc.documentId,
      sourceDraftVersion: 2,
      document: fixtureDoc,
      assets,
    });
    const altered = {
      ...fixtureDoc,
      title: `${fixtureDoc.title}-changed`,
    };
    const b = buildIntroPackV1({
      packId: "pack-a",
      publishedRevisionId: "rev-a",
      documentId: fixtureDoc.documentId,
      sourceDraftVersion: 2,
      document: altered,
      assets,
    });
    expect(a.packIntegrity).not.toBe(b.packIntegrity);
    expect(a.documentIntegrity.documentDigest).not.toBe(
      b.documentIntegrity.documentDigest,
    );
  });

  it("preserves IntroDocumentV1 scene semantics in pack", () => {
    const pack = buildIntroPackV1({
      packId: "pack-full",
      publishedRevisionId: "rev-full",
      documentId: fixtureDoc.documentId,
      sourceDraftVersion: 1,
      document: fixtureDoc,
      assets,
    });
    expect(pack.document.scenes.length).toBe(fixtureDoc.scenes.length);
    expect(pack.document.scenes.map((s) => s.sceneId)).toEqual(
      fixtureDoc.scenes.map((s) => s.sceneId),
    );
    const summary = packSummaryForReport(pack);
    expect(summary.sceneCount).toBe(fixtureDoc.scenes.length);
    expect(validatePackManifest({
      schemaVersion: pack.schemaVersion,
      protocolVersion: pack.protocolVersion,
      renderSpecVersion: pack.renderSpecVersion,
      fontSpecVersion: pack.fontSpecVersion,
      packId: pack.packId,
      publishedRevisionId: pack.publishedRevisionId,
      documentIntegrity: pack.documentIntegrity,
      sealedAssets: pack.assets.map((a) => ({
        sealedAssetId: a.sealedAssetId,
        mediaRefId: a.mediaRefId,
        integrity: a.sealedIntegrity,
      })),
    }).ok).toBe(true);
  });

  it("rejects packIntegrity tampering", () => {
    const pack = buildIntroPackV1({
      packId: "pack-a",
      publishedRevisionId: "rev-a",
      documentId: fixtureDoc.documentId,
      sourceDraftVersion: 1,
      document: fixtureDoc,
      assets,
    });
    expect(() =>
      parseIntroPackV1({ ...pack, packIntegrity: "sha256:deadbeef" }),
    ).toThrow(/PACK_INTEGRITY/);
  });
});

describe("V1 native consumability audit", () => {
  it("PASS for well-formed pack (Android + iOS views)", () => {
    const doc = CANONICAL_INTRO_FIXTURE_DOCUMENT;
    const mediaRefs = collectAuthoredMediaRefIds(doc);
    const assets = mediaRefs.map((mediaRefId, i) => ({
      sealedAssetId: `seal-${i}`,
      mediaRefId,
      mediaId: mediaRefId,
      runtimeArtifactId: `rt-${i}`,
      runtimeIntegrity: integrityOf(Buffer.from(`rt-${i}`)),
      sealedIntegrity: integrityOf(Buffer.from(`rt-${i}`)),
      kind: "IMAGE" as const,
      format: "image/png",
      mime: "image/png",
      width: 10,
      height: 10,
      byteLength: 4,
      relativePackPath: packRelativeAssetPath({
        sealedAssetId: `seal-${i}`,
        ext: "png",
      }),
      animationMetadata: null,
    }));
    // Fix GIF if present
    const pack = buildIntroPackV1({
      packId: "pack-c",
      publishedRevisionId: "rev-c",
      documentId: doc.documentId,
      sourceDraftVersion: 1,
      document: doc,
      assets: assets.map((a) =>
        a.mediaRefId.includes("gif")
          ? {
              ...a,
              kind: "GIF" as const,
              format: GifRuntimeFormat.CANONICAL_ANIMATED_GIF,
              mime: "image/gif",
            }
          : a,
      ),
    });
    const audit = auditNativeConsumability(pack);
    expect(audit.ok).toBe(true);
    expect(audit.android.canDetermineFirstScene).toBe("YES");
    expect(audit.ios.canLocateEverySealedAsset).toBe("YES");
    expect(audit.android.canDistinguishGif).toBe("YES");
  });

  it("FAIL when mediaRef missing from assets", () => {
    const doc = CANONICAL_INTRO_FIXTURE_DOCUMENT;
    const pack = buildIntroPackV1({
      packId: "pack-bad",
      publishedRevisionId: "rev-bad",
      documentId: doc.documentId,
      sourceDraftVersion: 1,
      document: doc,
      assets: [
        {
          sealedAssetId: "only-one",
          mediaRefId: "not-in-document",
          mediaId: "not-in-document",
          runtimeArtifactId: "rt",
          runtimeIntegrity: integrityOf(Buffer.from("x")),
          sealedIntegrity: integrityOf(Buffer.from("x")),
          kind: "IMAGE",
          format: "image/png",
          mime: "image/png",
          width: 1,
          height: 1,
          byteLength: 1,
          relativePackPath: "assets/only-one.png",
          animationMetadata: null,
        },
      ],
    });
    const audit = auditNativeConsumability(pack);
    expect(audit.ok).toBe(false);
    expect(audit.android.canLocateEverySealedAsset).toBe("NO");
  });
});

describe("V1 Publish validation", () => {
  it("blocks unknown / non-READY mediaRefId on PUBLISH", () => {
    const doc = CANONICAL_INTRO_FIXTURE_DOCUMENT;
    const fail = validatePublish(doc, {
      isMediaReady: () => false,
    });
    expect(fail.ok).toBe(false);
    expect(fail.issues.some((i) => i.code.includes("MEDIA") || i.path.includes("mediaRefId"))).toBe(
      true,
    );
  });

  it("passes when all authored mediaRefIds are READY", () => {
    const doc = CANONICAL_INTRO_FIXTURE_DOCUMENT;
    const ready = new Set(collectAuthoredMediaRefIds(doc));
    const ok = validatePublish(doc, {
      isMediaReady: (id) => ready.has(id),
    });
    expect(ok.ok).toBe(true);
  });
});

describe("V1 Draft capture semantics (pure)", () => {
  it("captured draft N digest stays equal after N+1 mutation of a copy", () => {
    const n = CANONICAL_INTRO_FIXTURE_DOCUMENT;
    const capturedDigest = documentDigestOf(n);
    const nPlus1 = { ...n, title: `${n.title}-next` };
    expect(documentDigestOf(nPlus1)).not.toBe(capturedDigest);
    // captured N unchanged
    expect(documentDigestOf(n)).toBe(capturedDigest);
  });
});

describe("V1 GIF authority", () => {
  it("pack GIF entries use CANONICAL_ANIMATED_GIF — no sharp+cgif", () => {
    const src = readFileSync("lib/intro/publish/service.ts", "utf8");
    expect(src).toContain("CANONICAL_ANIMATED_GIF");
    expect(src).not.toMatch(/sharp.*cgif|cgif/i);
    expect(src).toContain("NO re-encode");
  });
});

describe("V1 Live inert + historical quarantine", () => {
  it("Live default discriminant remains NEVER_CONFIGURED", () => {
    expect(AppIntroLiveKind.NEVER_CONFIGURED).toBe("NEVER_CONFIGURED");
  });

  it("publish service never writes app_intro_live", () => {
    const src = readFileSync("lib/intro/publish/service.ts", "utf8");
    expect(src).not.toMatch(/\.from\(["']app_intro_live["']\)\s*\.(insert|update|upsert)/);
    expect(src).toContain("assertLiveInert");
  });

  it("executable publish/pack graph has zero historical intro host dependency", () => {
    const files = [
      "lib/intro/publish/service.ts",
      "lib/intro/pack/canonical.ts",
      "lib/intro/pack/consumability.ts",
      "lib/intro/pack/paths.ts",
      "app/api/admin/intro/documents/[documentId]/publish/route.ts",
    ];
    for (const f of files) {
      expect(existsSync(f)).toBe(true);
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/dibay_intro_/);
      expect(src).not.toMatch(/intro_v2/);
      expect(src).not.toMatch(/intro_v3/);
      expect(src).not.toMatch(/opening_/);
      expect(src).not.toMatch(/startup_product_intro_v1/);
      expect(src).not.toMatch(/intro11|intro12|vNext|test-product/);
    }
  });
});

describe("V1 Admin Publish surface", () => {
  it("Publish API route + Studio publish control exist", () => {
    expect(
      existsSync("app/api/admin/intro/documents/[documentId]/publish/route.ts"),
    ).toBe(true);
    const studio = readFileSync("components/admin/intro/IntroStudio.tsx", "utf8");
    expect(studio).toContain("data-intro-publish");
    expect(studio).toContain("data-intro-publish-confirm");
    expect(studio).toContain("publishIntroDocumentApi");
    // Publish confirm still distinguishes 앱 적용 from Publish
    expect(studio).toMatch(/앱 적용/);
  });

  it("minimal fixture path uses same pack builder (no special minimal code path)", () => {
    const service = readFileSync("lib/intro/publish/service.ts", "utf8");
    expect(service).toContain("buildIntroPackV1");
    expect(service).not.toMatch(/minimalPack|specialMinimal|fakeManifest/);
  });
});

describe("V1 media collect", () => {
  it("collects IMAGE/LOGO mediaRefIds only", () => {
    let doc = createEmptyIntroDocument({
      documentId: "doc-min",
      title: "min",
    });
    // Seed one scene then add layers
    doc = {
      ...doc,
      scenes: [
        {
          sceneId: "scene-1",
          name: "S1",
          durationMs: 1000,
          background: { type: "SOLID", color: "#000" },
          transitionAfter: null,
          layers: [],
        },
      ],
    };
    doc = addLayerMut(doc, "scene-1", "LOGO", { mediaRefId: "m-logo" }).document;
    doc = addLayerMut(doc, "scene-1", "TEXT").document;
    doc = addLayerMut(doc, "scene-1", "CTA").document;
    expect(collectAuthoredMediaRefIds(doc)).toEqual(["m-logo"]);
  });
});

describe("V1 packIntegrityOf helper", () => {
  it("integrity excludes packIntegrity field itself", () => {
    const doc = createEmptyIntroDocument({ documentId: "d1", title: "t" });
    // empty scenes need a layer media for consumability of real packs; integrity still works
    const assets = [
      {
        sealedAssetId: "s1",
        mediaRefId: "m1",
        mediaId: "m1",
        runtimeArtifactId: "r1",
        runtimeIntegrity: integrityOf(Buffer.from("a")),
        sealedIntegrity: integrityOf(Buffer.from("a")),
        kind: "LOGO" as const,
        format: "image/png",
        mime: "image/png",
        width: 1,
        height: 1,
        byteLength: 1,
        relativePackPath: "assets/s1.png",
        animationMetadata: null,
      },
    ];
    const pack = buildIntroPackV1({
      packId: "p1",
      publishedRevisionId: "rv1",
      documentId: "d1",
      sourceDraftVersion: 1,
      document: doc,
      assets,
    });
    expect(packIntegrityOf(pack)).toBe(pack.packIntegrity);
  });
});
