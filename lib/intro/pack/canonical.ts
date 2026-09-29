/**
 * DIBAY INTRO — V1 pack canonicalization + integrity helpers.
 * Integrity authority is canonical JSON + sealed asset bytes — not archive timestamps.
 */

import type { IntroDocumentV1 } from "@/lib/intro/contracts/document";
import {
  INTRO_AUTHORITY_GENERATION,
  INTRO_FONT_SPEC_VERSION,
  INTRO_PACK_MANIFEST_VERSION,
  INTRO_PACK_REQUIRED_FONTS,
  INTRO_PACK_SCHEMA_VERSION,
  INTRO_PACK_SUPPORTED_ACTIONS,
  INTRO_PACK_SUPPORTED_MEDIA_RUNTIME_FORMATS,
  INTRO_PACK_SUPPORTED_TRANSITIONS,
  INTRO_PROTOCOL_VERSION,
  INTRO_RENDER_SPEC_VERSION,
  INTRO_TIMELINE_SPEC_VERSION,
  type IntroPackAssetEntryV1,
  type IntroPackV1,
} from "@/lib/intro/contracts/pack";
import { canonicalizeAuthoredDocument } from "@/lib/intro/document/canonical-equality";
import { integrityOf } from "@/lib/intro/media/integrity";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function documentDigestOf(document: IntroDocumentV1): string {
  const canonical = canonicalizeAuthoredDocument(document);
  return integrityOf(Buffer.from(stableStringify(canonical), "utf8"));
}

export function assetSetIntegrityOf(
  assets: ReadonlyArray<Pick<IntroPackAssetEntryV1, "sealedAssetId" | "sealedIntegrity">>,
): string {
  const ordered = [...assets]
    .map((a) => ({
      sealedAssetId: a.sealedAssetId,
      sealedIntegrity: a.sealedIntegrity,
    }))
    .sort((a, b) => a.sealedAssetId.localeCompare(b.sealedAssetId));
  return integrityOf(Buffer.from(stableStringify(ordered), "utf8"));
}

/** Pack payload without packIntegrity — hash of this is packIntegrity. */
export function packPayloadForIntegrity(
  pack: Omit<IntroPackV1, "packIntegrity"> | IntroPackV1,
): string {
  const { packIntegrity: _ignored, ...rest } = pack as IntroPackV1 & {
    packIntegrity?: string;
  };
  void _ignored;
  return stableStringify(rest);
}

export function packIntegrityOf(
  pack: Omit<IntroPackV1, "packIntegrity"> | IntroPackV1,
): string {
  return integrityOf(Buffer.from(packPayloadForIntegrity(pack), "utf8"));
}

export function buildIntroPackV1(args: {
  packId: string;
  publishedRevisionId: string;
  documentId: string;
  sourceDraftVersion: number;
  document: IntroDocumentV1;
  assets: ReadonlyArray<IntroPackAssetEntryV1>;
}): IntroPackV1 {
  const documentDigest = documentDigestOf(args.document);
  const assetSetIntegrity = assetSetIntegrityOf(args.assets);
  const withoutIntegrity: Omit<IntroPackV1, "packIntegrity"> = {
    manifestVersion: INTRO_PACK_MANIFEST_VERSION,
    schemaVersion: INTRO_PACK_SCHEMA_VERSION,
    protocolVersion: INTRO_PROTOCOL_VERSION,
    renderSpecVersion: INTRO_RENDER_SPEC_VERSION,
    fontSpecVersion: INTRO_FONT_SPEC_VERSION,
    timelineSpecVersion: INTRO_TIMELINE_SPEC_VERSION,
    authorityGeneration: INTRO_AUTHORITY_GENERATION,
    packId: args.packId,
    publishedRevisionId: args.publishedRevisionId,
    documentId: args.documentId,
    sourceDraftVersion: args.sourceDraftVersion,
    documentIntegrity: {
      documentId: args.documentId,
      documentDigest,
    },
    assetSetIntegrity,
    document: canonicalizeAuthoredDocument(args.document),
    assets: [...args.assets].sort((a, b) =>
      a.sealedAssetId.localeCompare(b.sealedAssetId),
    ),
    compatibility: {
      supportedTransitions: [...INTRO_PACK_SUPPORTED_TRANSITIONS],
      supportedActions: [...INTRO_PACK_SUPPORTED_ACTIONS],
      supportedMediaRuntimeFormats: [
        ...INTRO_PACK_SUPPORTED_MEDIA_RUNTIME_FORMATS,
      ],
      requiredFonts: [...INTRO_PACK_REQUIRED_FONTS],
    },
  };
  return {
    ...withoutIntegrity,
    packIntegrity: packIntegrityOf(withoutIntegrity),
  };
}

/** Decode pack.json text → IntroPackV1 (no binary dump). */
export function parseIntroPackV1(raw: unknown): IntroPackV1 {
  if (raw == null || typeof raw !== "object") {
    throw new Error("INVALID_PACK_JSON");
  }
  const p = raw as IntroPackV1;
  if (
    p.manifestVersion !== INTRO_PACK_MANIFEST_VERSION ||
    p.schemaVersion !== INTRO_PACK_SCHEMA_VERSION ||
    p.protocolVersion !== INTRO_PROTOCOL_VERSION ||
    p.renderSpecVersion !== INTRO_RENDER_SPEC_VERSION ||
    p.fontSpecVersion !== INTRO_FONT_SPEC_VERSION ||
    p.timelineSpecVersion !== INTRO_TIMELINE_SPEC_VERSION
  ) {
    throw new Error("INCOMPATIBLE_PACK_VERSION");
  }
  if (!p.packId || !p.publishedRevisionId || !p.document || !Array.isArray(p.assets)) {
    throw new Error("INVALID_PACK_SHAPE");
  }
  const expected = packIntegrityOf(p);
  if (p.packIntegrity !== expected) {
    throw new Error("PACK_INTEGRITY_MISMATCH");
  }
  return p;
}

export function packSummaryForReport(pack: IntroPackV1): Record<string, unknown> {
  return {
    manifestVersion: pack.manifestVersion,
    schemaVersion: pack.schemaVersion,
    protocolVersion: pack.protocolVersion,
    renderSpecVersion: pack.renderSpecVersion,
    fontSpecVersion: pack.fontSpecVersion,
    timelineSpecVersion: pack.timelineSpecVersion,
    packId: pack.packId,
    publishedRevisionId: pack.publishedRevisionId,
    documentId: pack.documentId,
    sourceDraftVersion: pack.sourceDraftVersion,
    documentIntegrity: pack.documentIntegrity,
    assetSetIntegrity: pack.assetSetIntegrity,
    packIntegrity: pack.packIntegrity,
    sceneCount: pack.document.scenes.length,
    scenes: pack.document.scenes.map((s) => ({
      sceneId: s.sceneId,
      name: s.name,
      durationMs: s.durationMs,
      background: s.background,
      transitionAfter: s.transitionAfter,
      layerCount: s.layers.length,
      layers: s.layers.map((l) => ({
        layerId: l.layerId,
        type: l.type,
        frame: l.frame,
        visible: l.visible,
        opacity: l.opacity,
        zIndex: l.zIndex,
        motion: l.motion ?? { type: "NONE", startMs: 0, durationMs: 0 },
        hasTabletOverride: Boolean(l.layoutOverrides?.TABLET_LANDSCAPE),
        mediaRefId:
          l.type === "IMAGE" || l.type === "LOGO" ? l.mediaRefId : undefined,
        surface: l.type === "IMAGE" ? l.surface : undefined,
        action: l.type === "CTA" ? l.action : undefined,
      })),
    })),
    assets: pack.assets.map((a) => ({
      sealedAssetId: a.sealedAssetId,
      mediaRefId: a.mediaRefId,
      mediaId: a.mediaId,
      runtimeArtifactId: a.runtimeArtifactId,
      format: a.format,
      mime: a.mime,
      width: a.width,
      height: a.height,
      byteLength: a.byteLength,
      sealedIntegrity: a.sealedIntegrity,
      relativePackPath: a.relativePackPath,
      animationMetadata: a.animationMetadata,
    })),
    compatibility: pack.compatibility,
  };
}
