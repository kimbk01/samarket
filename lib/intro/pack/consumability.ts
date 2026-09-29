/**
 * DIBAY INTRO — V1 native consumability audit (Android / iOS consumer views).
 * Mandatory in V1 even though native renderers are V3/V4.
 * Malformed Pack = V1 FAIL — do not postpone to V3.
 */

import type { IntroPackV1 } from "@/lib/intro/contracts/pack";
import {
  INTRO_FONT_SPEC_VERSION,
  INTRO_PACK_SCHEMA_VERSION,
  INTRO_PROTOCOL_VERSION,
  INTRO_RENDER_SPEC_VERSION,
  INTRO_TIMELINE_SPEC_VERSION,
} from "@/lib/intro/contracts/pack";
import { GifRuntimeFormat } from "@/lib/intro/contracts/gif";
import { packIntegrityOf } from "./canonical";

export type NativeConsumabilityAnswer =
  | "YES"
  | "NO";

export type NativeConsumabilityAudit = {
  readonly platform: "ANDROID" | "IOS";
  readonly canParseWithoutServerKnowledge: NativeConsumabilityAnswer;
  readonly canLocateEverySealedAsset: NativeConsumabilityAnswer;
  readonly canVerifyIntegrity: NativeConsumabilityAnswer;
  readonly canDetermineFirstScene: NativeConsumabilityAnswer;
  readonly canCalculateGeometry: NativeConsumabilityAnswer;
  readonly canDetermineTimeline: NativeConsumabilityAnswer;
  readonly canDistinguishGif: NativeConsumabilityAnswer;
  readonly canIdentifyFontRequirement: NativeConsumabilityAnswer;
  readonly canRejectIncompatibleVersions: NativeConsumabilityAnswer;
  readonly ok: boolean;
  readonly failures: readonly string[];
};

function auditPack(platform: "ANDROID" | "IOS", pack: IntroPackV1): NativeConsumabilityAudit {
  const failures: string[] = [];

  const canParseWithoutServerKnowledge: NativeConsumabilityAnswer =
    pack.document?.schemaVersion === 1 &&
    Array.isArray(pack.document.scenes) &&
    Array.isArray(pack.assets) &&
    typeof pack.packId === "string" &&
    typeof pack.publishedRevisionId === "string"
      ? "YES"
      : "NO";
  if (canParseWithoutServerKnowledge === "NO") {
    failures.push("cannot_parse_pack_without_server");
  }

  const canLocateEverySealedAsset: NativeConsumabilityAnswer = (() => {
    for (const a of pack.assets) {
      if (!a.sealedAssetId || !a.relativePackPath?.startsWith("assets/")) {
        return "NO";
      }
    }
    // Every IMAGE/LOGO mediaRefId must map to an asset
    for (const scene of pack.document.scenes) {
      for (const layer of scene.layers) {
        if (layer.type === "IMAGE" || layer.type === "LOGO") {
          if (!layer.mediaRefId) return "NO";
          const hit = pack.assets.find((a) => a.mediaRefId === layer.mediaRefId);
          if (!hit) return "NO";
        }
      }
    }
    return "YES";
  })();
  if (canLocateEverySealedAsset === "NO") {
    failures.push("cannot_locate_sealed_assets");
  }

  const canVerifyIntegrity: NativeConsumabilityAnswer = (() => {
    try {
      if (packIntegrityOf(pack) !== pack.packIntegrity) return "NO";
      for (const a of pack.assets) {
        if (!a.sealedIntegrity?.startsWith("sha256:")) return "NO";
        if (typeof a.byteLength !== "number" || a.byteLength < 0) return "NO";
      }
      if (!pack.documentIntegrity?.documentDigest?.startsWith("sha256:")) {
        return "NO";
      }
      if (!pack.assetSetIntegrity?.startsWith("sha256:")) return "NO";
      return "YES";
    } catch {
      return "NO";
    }
  })();
  if (canVerifyIntegrity === "NO") {
    failures.push("cannot_verify_integrity");
  }

  const canDetermineFirstScene: NativeConsumabilityAnswer =
    pack.document.scenes.length > 0 &&
    typeof pack.document.scenes[0]!.sceneId === "string"
      ? "YES"
      : "NO";
  if (canDetermineFirstScene === "NO") {
    failures.push("cannot_determine_first_scene");
  }

  const canCalculateGeometry: NativeConsumabilityAnswer = (() => {
    for (const scene of pack.document.scenes) {
      for (const layer of scene.layers) {
        const f = layer.frame;
        if (
          typeof f?.x !== "number" ||
          typeof f?.y !== "number" ||
          typeof f?.w !== "number" ||
          typeof f?.h !== "number"
        ) {
          return "NO";
        }
      }
    }
    if (
      pack.document.settings?.compositionAspect?.w !== 9 ||
      pack.document.settings?.compositionAspect?.h !== 16
    ) {
      return "NO";
    }
    return "YES";
  })();
  if (canCalculateGeometry === "NO") {
    failures.push("cannot_calculate_geometry");
  }

  const canDetermineTimeline: NativeConsumabilityAnswer = (() => {
    for (const scene of pack.document.scenes) {
      if (typeof scene.durationMs !== "number" || scene.durationMs <= 0) {
        return "NO";
      }
    }
    if (pack.timelineSpecVersion !== INTRO_TIMELINE_SPEC_VERSION) return "NO";
    return "YES";
  })();
  if (canDetermineTimeline === "NO") {
    failures.push("cannot_determine_timeline");
  }

  const canDistinguishGif: NativeConsumabilityAnswer = (() => {
    for (const a of pack.assets) {
      const isGif =
        a.format === GifRuntimeFormat.CANONICAL_ANIMATED_GIF ||
        a.mime === "image/gif" ||
        a.kind === "GIF";
      if (isGif) {
        if (a.format !== GifRuntimeFormat.CANONICAL_ANIMATED_GIF) return "NO";
      }
    }
    return "YES";
  })();
  if (canDistinguishGif === "NO") {
    failures.push("cannot_distinguish_gif");
  }

  const canIdentifyFontRequirement: NativeConsumabilityAnswer =
    Array.isArray(pack.compatibility?.requiredFonts) &&
    pack.compatibility.requiredFonts.length > 0 &&
    pack.fontSpecVersion === INTRO_FONT_SPEC_VERSION
      ? "YES"
      : "NO";
  if (canIdentifyFontRequirement === "NO") {
    failures.push("cannot_identify_font_requirement");
  }

  const canRejectIncompatibleVersions: NativeConsumabilityAnswer =
    pack.schemaVersion === INTRO_PACK_SCHEMA_VERSION &&
    pack.protocolVersion === INTRO_PROTOCOL_VERSION &&
    pack.renderSpecVersion === INTRO_RENDER_SPEC_VERSION &&
    pack.fontSpecVersion === INTRO_FONT_SPEC_VERSION
      ? "YES"
      : "NO";
  if (canRejectIncompatibleVersions === "NO") {
    failures.push("cannot_reject_incompatible_versions");
  }

  const ok = failures.length === 0;
  return {
    platform,
    canParseWithoutServerKnowledge,
    canLocateEverySealedAsset,
    canVerifyIntegrity,
    canDetermineFirstScene,
    canCalculateGeometry,
    canDetermineTimeline,
    canDistinguishGif,
    canIdentifyFontRequirement,
    canRejectIncompatibleVersions,
    ok,
    failures,
  };
}

export function auditAndroidConsumability(pack: IntroPackV1): NativeConsumabilityAudit {
  return auditPack("ANDROID", pack);
}

export function auditIosConsumability(pack: IntroPackV1): NativeConsumabilityAudit {
  return auditPack("IOS", pack);
}

export function auditNativeConsumability(pack: IntroPackV1): {
  android: NativeConsumabilityAudit;
  ios: NativeConsumabilityAudit;
  ok: boolean;
} {
  const android = auditAndroidConsumability(pack);
  const ios = auditIosConsumability(pack);
  return { android, ios, ok: android.ok && ios.ok };
}
