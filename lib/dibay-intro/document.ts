/**
 * DIBAY Intro — canonical working / published document.
 * Schema is complete from day one: scenes[] and IMAGE|LOGO|TEXT|CTA.
 * Initial CONTENT may contain one Scene. Architecture is never singular.
 */

export const DIBAY_INTRO_DOCUMENT_VERSION = 1 as const;

export const DIBAY_GREEN = "#0B421A";
export const DIBAY_INTRO_FONT_FAMILY = "Pretendard Variable";
export const DIBAY_INTRO_FONT_WEIGHTS = [400, 500, 600, 700] as const;

/** CUT still perceptible; 20s/scene keeps a 3-scene Intro under ~1 minute. */
export const SCENE_DURATION_MS_MIN = 400;
export const SCENE_DURATION_MS_MAX = 20_000;
export const SCENE_DURATION_MS_DEFAULT = 2_400;

export type SceneTransitionKind = "CUT" | "FADE" | "SLIDE";
export type SlideDirection = "left" | "right" | "up" | "down";
export type MediaFit = "contain" | "cover";
export type TextAlign = "left" | "center" | "right";
export type CtaActionKind = "CONTINUE" | "FINISH_INTRO" | "APPROVED_INTERNAL_ROUTE";
export type CtaVisualStyle = "primary" | "secondary";
export type LayerType = "IMAGE" | "LOGO" | "TEXT" | "CTA";

export type NormalizedFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SceneBackground = {
  type: "solid";
  color: string;
};

export type SceneTransition =
  | { kind: "CUT" }
  | { kind: "FADE"; durationMs: number }
  | { kind: "SLIDE"; durationMs: number; direction: SlideDirection };

export type ImageLayer = {
  id: string;
  type: "IMAGE";
  z: number;
  visible: boolean;
  opacity: number;
  frame: NormalizedFrame;
  mediaId: string;
  fit: MediaFit;
};

export type LogoLayer = {
  id: string;
  type: "LOGO";
  z: number;
  visible: boolean;
  opacity: number;
  frame: NormalizedFrame;
  mediaId: string;
  fit: "contain";
};

export type TextLayer = {
  id: string;
  type: "TEXT";
  z: number;
  visible: boolean;
  opacity: number;
  frame: NormalizedFrame;
  content: string;
  fontFamily: typeof DIBAY_INTRO_FONT_FAMILY;
  fontSizePx: number;
  fontWeight: (typeof DIBAY_INTRO_FONT_WEIGHTS)[number];
  align: TextAlign;
  color: string;
  lineHeight: number;
};

export type CtaLayer = {
  id: string;
  type: "CTA";
  z: number;
  visible: boolean;
  opacity: number;
  frame: NormalizedFrame;
  label: string;
  style: CtaVisualStyle;
  action: CtaActionKind;
  destination: string | null;
};

export type DibayIntroLayer = ImageLayer | LogoLayer | TextLayer | CtaLayer;

export type DibayIntroScene = {
  id: string;
  name: string;
  order: number;
  durationMs: number;
  background: SceneBackground;
  transition: SceneTransition;
  layers: DibayIntroLayer[];
};

export type DibayIntroSettings = {
  defaultBackgroundColor: string;
};

export type DibayIntroDocument = {
  version: typeof DIBAY_INTRO_DOCUMENT_VERSION;
  settings: DibayIntroSettings;
  scenes: DibayIntroScene[];
};

export type DocumentIssue = { path: string; message: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNormalizedUnit(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0 && v <= 1;
}

function parseFrame(raw: unknown, path: string, issues: DocumentIssue[]): NormalizedFrame | null {
  if (!isRecord(raw)) {
    issues.push({ path, message: "frame required" });
    return null;
  }
  const { x, y, width, height } = raw;
  if (!isNormalizedUnit(x) || !isNormalizedUnit(y) || !isNormalizedUnit(width) || !isNormalizedUnit(height)) {
    issues.push({ path, message: "frame x/y/width/height must be 0..1" });
    return null;
  }
  if (x + width > 1.0001 || y + height > 1.0001) {
    issues.push({ path, message: "frame must stay inside the normalized viewport" });
    return null;
  }
  return { x, y, width, height };
}

function parseBackground(raw: unknown, path: string, issues: DocumentIssue[]): SceneBackground | null {
  if (!isRecord(raw) || raw.type !== "solid" || typeof raw.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(raw.color)) {
    issues.push({ path, message: "background must be solid #RRGGBB" });
    return null;
  }
  return { type: "solid", color: raw.color.toUpperCase() };
}

function parseTransition(raw: unknown, path: string, issues: DocumentIssue[]): SceneTransition | null {
  if (!isRecord(raw) || typeof raw.kind !== "string") {
    issues.push({ path, message: "transition required" });
    return null;
  }
  if (raw.kind === "CUT") return { kind: "CUT" };
  if (raw.kind === "FADE") {
    const durationMs = isFiniteNumber(raw.durationMs) ? raw.durationMs : 240;
    if (durationMs < 80 || durationMs > 1200) {
      issues.push({ path, message: "FADE durationMs must be 80..1200" });
      return null;
    }
    return { kind: "FADE", durationMs };
  }
  if (raw.kind === "SLIDE") {
    const durationMs = isFiniteNumber(raw.durationMs) ? raw.durationMs : 320;
    const direction = raw.direction;
    if (durationMs < 80 || durationMs > 1200) {
      issues.push({ path, message: "SLIDE durationMs must be 80..1200" });
      return null;
    }
    if (direction !== "left" && direction !== "right" && direction !== "up" && direction !== "down") {
      issues.push({ path, message: "SLIDE direction must be left|right|up|down" });
      return null;
    }
    return { kind: "SLIDE", durationMs, direction };
  }
  issues.push({ path, message: "transition kind must be CUT|FADE|SLIDE" });
  return null;
}

function parseCommonLayer(
  raw: Record<string, unknown>,
  path: string,
  issues: DocumentIssue[],
): { id: string; z: number; visible: boolean; opacity: number; frame: NormalizedFrame } | null {
  if (typeof raw.id !== "string" || !raw.id) {
    issues.push({ path, message: "layer id required" });
    return null;
  }
  if (!Number.isInteger(raw.z)) {
    issues.push({ path: `${path}.z`, message: "z must be an integer" });
    return null;
  }
  if (typeof raw.visible !== "boolean") {
    issues.push({ path: `${path}.visible`, message: "visible must be boolean" });
    return null;
  }
  if (!isFiniteNumber(raw.opacity) || raw.opacity < 0 || raw.opacity > 1) {
    issues.push({ path: `${path}.opacity`, message: "opacity must be 0..1" });
    return null;
  }
  const frame = parseFrame(raw.frame, `${path}.frame`, issues);
  if (!frame) return null;
  return { id: raw.id, z: raw.z as number, visible: raw.visible, opacity: raw.opacity, frame };
}

function parseLayer(raw: unknown, path: string, issues: DocumentIssue[]): DibayIntroLayer | null {
  if (!isRecord(raw) || typeof raw.type !== "string") {
    issues.push({ path, message: "layer type required" });
    return null;
  }
  const common = parseCommonLayer(raw, path, issues);
  if (!common) return null;
  if (raw.type === "IMAGE") {
    if (typeof raw.mediaId !== "string" || !raw.mediaId) {
      issues.push({ path: `${path}.mediaId`, message: "IMAGE mediaId required" });
      return null;
    }
    if (raw.fit !== "contain" && raw.fit !== "cover") {
      issues.push({ path: `${path}.fit`, message: "IMAGE fit must be contain|cover" });
      return null;
    }
    return { ...common, type: "IMAGE", mediaId: raw.mediaId, fit: raw.fit };
  }
  if (raw.type === "LOGO") {
    if (typeof raw.mediaId !== "string" || !raw.mediaId) {
      issues.push({ path: `${path}.mediaId`, message: "LOGO mediaId required" });
      return null;
    }
    return { ...common, type: "LOGO", mediaId: raw.mediaId, fit: "contain" };
  }
  if (raw.type === "TEXT") {
    if (typeof raw.content !== "string") {
      issues.push({ path: `${path}.content`, message: "TEXT content required" });
      return null;
    }
    if (raw.fontFamily !== DIBAY_INTRO_FONT_FAMILY) {
      issues.push({ path: `${path}.fontFamily`, message: "TEXT fontFamily must be Pretendard Variable" });
      return null;
    }
    if (!isFiniteNumber(raw.fontSizePx) || raw.fontSizePx < 10 || raw.fontSizePx > 96) {
      issues.push({ path: `${path}.fontSizePx`, message: "TEXT fontSizePx must be 10..96" });
      return null;
    }
    if (!(DIBAY_INTRO_FONT_WEIGHTS as readonly number[]).includes(raw.fontWeight as number)) {
      issues.push({ path: `${path}.fontWeight`, message: "TEXT fontWeight must be 400|500|600|700" });
      return null;
    }
    if (raw.align !== "left" && raw.align !== "center" && raw.align !== "right") {
      issues.push({ path: `${path}.align`, message: "TEXT align must be left|center|right" });
      return null;
    }
    if (typeof raw.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(raw.color)) {
      issues.push({ path: `${path}.color`, message: "TEXT color must be #RRGGBB" });
      return null;
    }
    if (!isFiniteNumber(raw.lineHeight) || raw.lineHeight < 1 || raw.lineHeight > 2.4) {
      issues.push({ path: `${path}.lineHeight`, message: "TEXT lineHeight must be 1..2.4" });
      return null;
    }
    return {
      ...common,
      type: "TEXT",
      content: raw.content,
      fontFamily: DIBAY_INTRO_FONT_FAMILY,
      fontSizePx: raw.fontSizePx,
      fontWeight: raw.fontWeight as (typeof DIBAY_INTRO_FONT_WEIGHTS)[number],
      align: raw.align,
      color: raw.color.toUpperCase(),
      lineHeight: raw.lineHeight,
    };
  }
  if (raw.type === "CTA") {
    if (typeof raw.label !== "string" || !raw.label.trim()) {
      issues.push({ path: `${path}.label`, message: "CTA label required" });
      return null;
    }
    if (raw.style !== "primary" && raw.style !== "secondary") {
      issues.push({ path: `${path}.style`, message: "CTA style must be primary|secondary" });
      return null;
    }
    if (raw.action !== "CONTINUE" && raw.action !== "FINISH_INTRO" && raw.action !== "APPROVED_INTERNAL_ROUTE") {
      issues.push({ path: `${path}.action`, message: "CTA action invalid" });
      return null;
    }
    const destination = raw.destination == null ? null : raw.destination;
    if (raw.action === "APPROVED_INTERNAL_ROUTE") {
      if (typeof destination !== "string" || !destination.startsWith("/")) {
        issues.push({ path: `${path}.destination`, message: "APPROVED_INTERNAL_ROUTE needs destination" });
        return null;
      }
    } else if (destination != null) {
      issues.push({ path: `${path}.destination`, message: "destination only for APPROVED_INTERNAL_ROUTE" });
      return null;
    }
    return {
      ...common,
      type: "CTA",
      label: raw.label.trim(),
      style: raw.style,
      action: raw.action,
      destination: raw.action === "APPROVED_INTERNAL_ROUTE" ? (destination as string) : null,
    };
  }
  issues.push({ path, message: "layer type must be IMAGE|LOGO|TEXT|CTA" });
  return null;
}

function parseScene(raw: unknown, path: string, issues: DocumentIssue[]): DibayIntroScene | null {
  if (!isRecord(raw)) {
    issues.push({ path, message: "scene object required" });
    return null;
  }
  if (typeof raw.id !== "string" || !raw.id) {
    issues.push({ path: `${path}.id`, message: "scene id required" });
    return null;
  }
  if (typeof raw.name !== "string") {
    issues.push({ path: `${path}.name`, message: "scene name required" });
    return null;
  }
  if (!Number.isInteger(raw.order) || (raw.order as number) < 0) {
    issues.push({ path: `${path}.order`, message: "scene order must be integer >= 0" });
    return null;
  }
  if (
    !isFiniteNumber(raw.durationMs) ||
    raw.durationMs < SCENE_DURATION_MS_MIN ||
    raw.durationMs > SCENE_DURATION_MS_MAX
  ) {
    issues.push({
      path: `${path}.durationMs`,
      message: `durationMs must be ${SCENE_DURATION_MS_MIN}..${SCENE_DURATION_MS_MAX}`,
    });
    return null;
  }
  const background = parseBackground(raw.background, `${path}.background`, issues);
  const transition = parseTransition(raw.transition, `${path}.transition`, issues);
  if (!background || !transition) return null;
  if (!Array.isArray(raw.layers)) {
    issues.push({ path: `${path}.layers`, message: "layers[] required" });
    return null;
  }
  const layers: DibayIntroLayer[] = [];
  raw.layers.forEach((layer, i) => {
    const parsed = parseLayer(layer, `${path}.layers[${i}]`, issues);
    if (parsed) layers.push(parsed);
  });
  const ids = new Set(layers.map((l) => l.id));
  if (ids.size !== layers.length) {
    issues.push({ path: `${path}.layers`, message: "layer ids must be unique" });
  }
  return {
    id: raw.id,
    name: raw.name,
    order: raw.order as number,
    durationMs: raw.durationMs,
    background,
    transition,
    layers,
  };
}

export function parseDibayIntroDocument(raw: unknown): {
  ok: true;
  document: DibayIntroDocument;
} | { ok: false; issues: DocumentIssue[] } {
  const issues: DocumentIssue[] = [];
  if (!isRecord(raw)) {
    return { ok: false, issues: [{ path: "", message: "document object required" }] };
  }
  if ("scene" in raw && !("scenes" in raw)) {
    issues.push({ path: "scenes", message: "singular scene is forbidden; scenes[] is canonical" });
  }
  if (raw.version !== DIBAY_INTRO_DOCUMENT_VERSION) {
    issues.push({ path: "version", message: `version must be ${DIBAY_INTRO_DOCUMENT_VERSION}` });
  }
  if (!isRecord(raw.settings) || typeof raw.settings.defaultBackgroundColor !== "string") {
    issues.push({ path: "settings.defaultBackgroundColor", message: "required" });
  }
  if (!Array.isArray(raw.scenes)) {
    issues.push({ path: "scenes", message: "scenes[] required" });
    return { ok: false, issues };
  }
  if (raw.scenes.length < 1) {
    issues.push({ path: "scenes", message: "at least one scene is required" });
  }
  const scenes: DibayIntroScene[] = [];
  raw.scenes.forEach((scene, i) => {
    const parsed = parseScene(scene, `scenes[${i}]`, issues);
    if (parsed) scenes.push(parsed);
  });
  const sceneIds = new Set(scenes.map((s) => s.id));
  if (sceneIds.size !== scenes.length) {
    issues.push({ path: "scenes", message: "scene ids must be unique" });
  }
  const orders = scenes.map((s) => s.order).sort((a, b) => a - b);
  if (orders.some((o, i) => o !== i)) {
    issues.push({ path: "scenes", message: "scene order must be 0..n-1 without gaps" });
  }
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    document: {
      version: DIBAY_INTRO_DOCUMENT_VERSION,
      settings: {
        defaultBackgroundColor: String(
          (raw.settings as { defaultBackgroundColor: string }).defaultBackgroundColor,
        ).toUpperCase(),
      },
      scenes: scenes.slice().sort((a, b) => a.order - b.order),
    },
  };
}

export function createDefaultDibayIntroDocument(): DibayIntroDocument {
  return {
    version: DIBAY_INTRO_DOCUMENT_VERSION,
    settings: { defaultBackgroundColor: DIBAY_GREEN },
    scenes: [
      {
        id: crypto.randomUUID(),
        name: "",
        order: 0,
        durationMs: SCENE_DURATION_MS_DEFAULT,
        background: { type: "solid", color: DIBAY_GREEN },
        transition: { kind: "CUT" },
        layers: [],
      },
    ],
  };
}

export function collectMediaIds(document: DibayIntroDocument): string[] {
  const ids: string[] = [];
  for (const scene of document.scenes) {
    for (const layer of scene.layers) {
      if (layer.type === "IMAGE" || layer.type === "LOGO") ids.push(layer.mediaId);
    }
  }
  return [...new Set(ids)];
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = stableJsonValue(obj[key]);
    return out;
  }
  return value;
}

export function canonicalDocumentJson(document: DibayIntroDocument): string {
  return JSON.stringify(stableJsonValue(document));
}

export function documentsSemanticallyEqual(a: DibayIntroDocument, b: DibayIntroDocument): boolean {
  return canonicalDocumentJson(a) === canonicalDocumentJson(b);
}
