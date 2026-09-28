import { isIntroV3LayerType } from "@/lib/startup/intro-v3/layer-model";
import {
  defaultIntroV3ImageGeometry,
  defaultIntroV3LogoGeometry,
  normalizeIntroV3Geometry,
  type IntroV3Fit,
  type IntroV3Geometry,
} from "@/lib/startup/intro-v3/geometry";
import {
  defaultIntroV3LayerMotion,
  parseIntroV3LayerMotion,
  parseIntroV3SceneTransition,
  type IntroV3LayerMotion,
  type IntroV3SceneTransition,
} from "@/lib/startup/intro-v3/motion";

export const INTRO_V3_SCHEMA_VERSION = 3 as const;

export const INTRO_V3_ADVANCE_MODES = ["TIMER", "MEDIA_END", "CTA_ONLY", "MANUAL"] as const;
export type IntroV3AdvanceMode = (typeof INTRO_V3_ADVANCE_MODES)[number];

export type IntroV3Background =
  | { type: "COLOR"; color: string }
  | { type: "IMAGE"; mediaRef: string; fit: IntroV3Fit; focalXPct: number; focalYPct: number }
  | { type: "GRADIENT"; colorA: string; colorB: string; angleDeg: number }
  | { type: "VIDEO"; mediaRef: string };

export type IntroV3ImagePayload = { mediaRef: string; alt?: string };
export type IntroV3LogoPayload = { mediaRef: string };
export type IntroV3TextPayload = { text: string; fontToken: string; color: string; align: "left" | "center" | "right" };
export type IntroV3CtaPayload = { label: string; href: string };
export type IntroV3DecorationPayload =
  | { kind: "COLOR"; color: string }
  | { kind: "MEDIA"; mediaRef: string };

export type IntroV3LayerPayload =
  | { type: "IMAGE"; payload: IntroV3ImagePayload }
  | { type: "LOGO"; payload: IntroV3LogoPayload }
  | { type: "TEXT"; payload: IntroV3TextPayload }
  | { type: "CTA"; payload: IntroV3CtaPayload }
  | { type: "DECORATION"; payload: IntroV3DecorationPayload };

export type IntroV3Layer = {
  id: string;
  type: IntroV3LayerPayload["type"];
  visible: boolean;
  z: number;
  geometry: IntroV3Geometry;
  motion: IntroV3LayerMotion;
} & IntroV3LayerPayload;

export type IntroV3Scene = {
  id: string;
  background: IntroV3Background;
  layers: IntroV3Layer[];
  holdMs: number;
  advance: IntroV3AdvanceMode;
  transition: IntroV3SceneTransition;
};

export type IntroV3Document = {
  schemaVersion: typeof INTRO_V3_SCHEMA_VERSION;
  scenes: IntroV3Scene[];
};

const HEX_COLOR = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isIntroV3HexColor(raw: unknown): raw is string {
  return typeof raw === "string" && HEX_COLOR.test(raw);
}

function parseBackground(raw: unknown): IntroV3Background | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.type === "COLOR") {
    if (!isIntroV3HexColor(rec.color)) return null;
    return { type: "COLOR", color: rec.color };
  }
  if (rec.type === "IMAGE") {
    if (typeof rec.mediaRef !== "string" || !rec.mediaRef.trim()) return null;
    const fit = rec.fit === "CONTAIN" ? "CONTAIN" : "COVER";
    const focalXPct = Number(rec.focalXPct ?? 50);
    const focalYPct = Number(rec.focalYPct ?? 50);
    if (!Number.isFinite(focalXPct) || !Number.isFinite(focalYPct)) return null;
    return { type: "IMAGE", mediaRef: rec.mediaRef.trim(), fit, focalXPct, focalYPct };
  }
  if (rec.type === "GRADIENT") {
    if (!isIntroV3HexColor(rec.colorA) || !isIntroV3HexColor(rec.colorB)) return null;
    const angleDeg = Number(rec.angleDeg ?? 180);
    if (!Number.isFinite(angleDeg)) return null;
    return { type: "GRADIENT", colorA: rec.colorA, colorB: rec.colorB, angleDeg };
  }
  if (rec.type === "VIDEO") {
    if (typeof rec.mediaRef !== "string" || !rec.mediaRef.trim()) return null;
    return { type: "VIDEO", mediaRef: rec.mediaRef.trim() };
  }
  return null;
}

function parseLayerPayload(type: IntroV3Layer["type"], payload: unknown): IntroV3LayerPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  if (type === "IMAGE") {
    if (typeof rec.mediaRef !== "string" || !rec.mediaRef.trim()) return null;
    return { type: "IMAGE", payload: { mediaRef: rec.mediaRef.trim(), alt: typeof rec.alt === "string" ? rec.alt : undefined } };
  }
  if (type === "LOGO") {
    if (typeof rec.mediaRef !== "string" || !rec.mediaRef.trim()) return null;
    return { type: "LOGO", payload: { mediaRef: rec.mediaRef.trim() } };
  }
  if (type === "TEXT") {
    if (typeof rec.text !== "string") return null;
    const align = rec.align === "left" || rec.align === "right" ? rec.align : "center";
    return {
      type: "TEXT",
      payload: {
        text: rec.text,
        fontToken: typeof rec.fontToken === "string" ? rec.fontToken : "sans",
        color: isIntroV3HexColor(rec.color) ? rec.color : "#FFFFFF",
        align,
      },
    };
  }
  if (type === "CTA") {
    if (typeof rec.label !== "string" || typeof rec.href !== "string") return null;
    return { type: "CTA", payload: { label: rec.label, href: rec.href } };
  }
  if (type === "DECORATION") {
    if (rec.kind === "MEDIA") {
      if (typeof rec.mediaRef !== "string" || !rec.mediaRef.trim()) return null;
      return { type: "DECORATION", payload: { kind: "MEDIA", mediaRef: rec.mediaRef.trim() } };
    }
    if (rec.kind === "COLOR" && isIntroV3HexColor(rec.color)) {
      return { type: "DECORATION", payload: { kind: "COLOR", color: rec.color } };
    }
    return null;
  }
  return null;
}

function parseLayer(raw: unknown): IntroV3Layer | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id.trim()) return null;
  if (!isIntroV3LayerType(rec.type)) return null;
  const geometry = normalizeIntroV3Geometry(rec.geometry) ??
    (rec.type === "LOGO" ? defaultIntroV3LogoGeometry() : defaultIntroV3ImageGeometry());
  const motion = parseIntroV3LayerMotion(rec.motion);
  if (!motion) return null;
  const payload = parseLayerPayload(rec.type, rec.payload ?? rec);
  if (!payload) return null;
  const z = Number(rec.z ?? 1);
  if (!Number.isFinite(z)) return null;
  return {
    id: rec.id.trim(),
    visible: rec.visible !== false,
    z: Math.round(z),
    geometry,
    motion,
    ...payload,
  };
}

function parseScene(raw: unknown): IntroV3Scene | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id.trim()) return null;
  const background = parseBackground(rec.background);
  if (!background) return null;
  if (!Array.isArray(rec.layers)) return null;
  const layers: IntroV3Layer[] = [];
  const seen = new Set<string>();
  for (const item of rec.layers) {
    const layer = parseLayer(item);
    if (!layer) return null;
    if (seen.has(layer.id)) return null;
    seen.add(layer.id);
    layers.push(layer);
  }
  const advance = rec.advance;
  if (typeof advance !== "string" || !(INTRO_V3_ADVANCE_MODES as readonly string[]).includes(advance)) {
    return null;
  }
  const holdMs = Number(rec.holdMs);
  if (!Number.isFinite(holdMs) || holdMs < 0 || holdMs > 60_000) return null;
  const transition = parseIntroV3SceneTransition(rec.transition);
  if (!transition) return null;
  return {
    id: rec.id.trim(),
    background,
    layers,
    holdMs: Math.round(holdMs),
    advance: advance as IntroV3AdvanceMode,
    transition,
  };
}

export function parseIntroV3Document(raw: unknown): IntroV3Document | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (rec.schemaVersion !== INTRO_V3_SCHEMA_VERSION) return null;
  if (!Array.isArray(rec.scenes) || rec.scenes.length < 1) return null;
  const scenes: IntroV3Scene[] = [];
  const seen = new Set<string>();
  for (const item of rec.scenes) {
    const scene = parseScene(item);
    if (!scene) return null;
    if (seen.has(scene.id)) return null;
    seen.add(scene.id);
    scenes.push(scene);
  }
  return { schemaVersion: INTRO_V3_SCHEMA_VERSION, scenes };
}

export function isIntroV3CampaignSource(source: unknown): boolean {
  if (!source || typeof source !== "object") return false;
  return (source as { introV3?: unknown }).introV3 === true;
}

export function extractIntroV3Document(source: unknown): IntroV3Document | null {
  if (!isIntroV3CampaignSource(source)) return null;
  const rec = source as { v3?: unknown };
  return parseIntroV3Document(rec.v3);
}

export function introV3CampaignSource(document: IntroV3Document): Record<string, unknown> {
  return { introV3: true, v3: document };
}
