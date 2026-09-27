import {
  INTRO_ANIMATION_TYPES,
  INTRO_ASPECT_POLICIES,
  INTRO_DECORATION_KINDS,
  INTRO_EASINGS,
  INTRO_FONT_TOKENS,
  INTRO_LAYER_ANCHORS,
  INTRO_LAYER_TYPES,
  INTRO_REPEAT_POLICIES,
  INTRO_TEXT_ALIGNS,
  isIn,
  type ContractResult,
  type IntroAnimationClip,
  type IntroAnimationMeta,
  type IntroLayer,
} from "@/lib/startup/intro-v2/types";

const LAYER_KEYS = new Set([
  "id",
  "type",
  "zIndex",
  "anchor",
  "name",
  "visible",
  "xPct",
  "yPct",
  "widthPct",
  "heightPct",
  "minWidthPct",
  "maxWidthPct",
  "opacity",
  "rotation",
  "safeArea",
  "aspectPolicy",
  "assetId",
  "text",
  "fontToken",
  "fontSizePct",
  "fontWeight",
  "lineHeight",
  "textAlign",
  "wrap",
  "maxLines",
  "color",
  "fillColor",
  "strokeColor",
  "strokeWidthPct",
  "cornerRadiusPct",
  "decorationKind",
  "animation",
]);

const HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

function optNumber(value: unknown, min: number, max: number, label: string): ContractResult<number | undefined> {
  if (value == null) return { ok: true, value: undefined };
  if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, error: `${label}_not_number` };
  if (value < min || value > max) return { ok: false, error: `${label}_out_of_range` };
  return { ok: true, value };
}

function optHex(value: unknown, label: string): ContractResult<string | undefined> {
  if (value == null) return { ok: true, value: undefined };
  if (typeof value !== "string" || !HEX.test(value)) return { ok: false, error: `${label}_invalid` };
  return { ok: true, value };
}

function validateAnimationClip(raw: unknown, phase: string): ContractResult<IntroAnimationClip | undefined> {
  if (raw == null) return { ok: true, value: undefined };
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `animation_${phase}_invalid` };
  }
  const rec = raw as Record<string, unknown>;
  if (!isIn(INTRO_ANIMATION_TYPES, rec.type ?? "none")) return { ok: false, error: `animation_${phase}_type` };
  const durationMs = optNumber(rec.durationMs ?? 0, 0, 30000, `${phase}_durationMs`);
  if (!durationMs.ok) return durationMs;
  const delayMs = optNumber(rec.delayMs ?? 0, 0, 30000, `${phase}_delayMs`);
  if (!delayMs.ok) return delayMs;
  if (rec.easing != null && !isIn(INTRO_EASINGS, rec.easing)) return { ok: false, error: `animation_${phase}_easing` };
  if (rec.repeat != null && !isIn(INTRO_REPEAT_POLICIES, rec.repeat)) {
    return { ok: false, error: `animation_${phase}_repeat` };
  }
  return {
    ok: true,
    value: {
      type: isIn(INTRO_ANIMATION_TYPES, rec.type) ? rec.type : "none",
      durationMs: durationMs.value ?? 0,
      delayMs: delayMs.value ?? 0,
      easing: isIn(INTRO_EASINGS, rec.easing) ? rec.easing : "ease_out",
      repeat: isIn(INTRO_REPEAT_POLICIES, rec.repeat) ? rec.repeat : "none",
    },
  };
}

function validateAnimation(raw: unknown): ContractResult<string | IntroAnimationMeta | undefined> {
  if (raw == null) return { ok: true, value: undefined };
  if (typeof raw === "string") return { ok: true, value: raw };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "animation_invalid" };
  const rec = raw as Record<string, unknown>;
  const enter = validateAnimationClip(rec.enter, "enter");
  if (!enter.ok) return enter;
  const emphasis = validateAnimationClip(rec.emphasis, "emphasis");
  if (!emphasis.ok) return emphasis;
  const exit = validateAnimationClip(rec.exit, "exit");
  if (!exit.ok) return exit;
  return {
    ok: true,
    value: {
      enter: enter.value,
      emphasis: emphasis.value,
      exit: exit.value,
    },
  };
}

export function validateIntroLayer(raw: unknown): ContractResult<IntroLayer> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "layer_not_object" };
  }
  const rec = raw as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (!LAYER_KEYS.has(key)) return { ok: false, error: "layer_unknown_key" };
  }
  if (typeof rec.id !== "string" || !rec.id.trim()) return { ok: false, error: "layer_id_required" };
  if (!isIn(INTRO_LAYER_TYPES, rec.type)) return { ok: false, error: "layer_type_invalid" };
  if (typeof rec.zIndex !== "number" || !Number.isFinite(rec.zIndex) || rec.zIndex < 0 || rec.zIndex > 1000) {
    return { ok: false, error: "layer_z_index_invalid" };
  }
  if (!isIn(INTRO_LAYER_ANCHORS, rec.anchor)) return { ok: false, error: "layer_anchor_invalid" };

  const xPct = optNumber(rec.xPct, 0, 100, "xPct");
  if (!xPct.ok) return xPct;
  const yPct = optNumber(rec.yPct, 0, 100, "yPct");
  if (!yPct.ok) return yPct;
  const widthPct = optNumber(rec.widthPct, 0, 100, "widthPct");
  if (!widthPct.ok) return widthPct;
  const heightPct = optNumber(rec.heightPct, 0, 100, "heightPct");
  if (!heightPct.ok) return heightPct;
  const minWidthPct = optNumber(rec.minWidthPct, 0, 100, "minWidthPct");
  if (!minWidthPct.ok) return minWidthPct;
  const maxWidthPct = optNumber(rec.maxWidthPct, 0, 100, "maxWidthPct");
  if (!maxWidthPct.ok) return maxWidthPct;
  if (minWidthPct.value != null && maxWidthPct.value != null && minWidthPct.value > maxWidthPct.value) {
    return { ok: false, error: "layer_min_max_invalid" };
  }
  const opacity = optNumber(rec.opacity, 0, 1, "opacity");
  if (!opacity.ok) return opacity;
  const rotation = optNumber(rec.rotation, -360, 360, "rotation");
  if (!rotation.ok) return rotation;
  if (rec.safeArea != null && typeof rec.safeArea !== "boolean") return { ok: false, error: "safeArea_not_boolean" };
  if (rec.visible != null && typeof rec.visible !== "boolean") return { ok: false, error: "visible_not_boolean" };
  if (rec.wrap != null && typeof rec.wrap !== "boolean") return { ok: false, error: "wrap_not_boolean" };
  if (rec.aspectPolicy != null && !isIn(INTRO_ASPECT_POLICIES, rec.aspectPolicy)) {
    return { ok: false, error: "aspect_policy_invalid" };
  }
  if (rec.assetId != null && (typeof rec.assetId !== "string" || !rec.assetId.trim())) {
    return { ok: false, error: "assetId_invalid" };
  }
  if (rec.name != null && typeof rec.name !== "string") return { ok: false, error: "layer_name_invalid" };
  if (rec.text != null && typeof rec.text !== "string") return { ok: false, error: "text_invalid" };
  if (rec.fontToken != null && !isIn(INTRO_FONT_TOKENS, rec.fontToken)) {
    return { ok: false, error: "fontToken_invalid" };
  }
  if (rec.decorationKind != null && !isIn(INTRO_DECORATION_KINDS, rec.decorationKind)) {
    return { ok: false, error: "decorationKind_invalid" };
  }
  const fontSizePct = optNumber(rec.fontSizePct, 0.5, 20, "fontSizePct");
  if (!fontSizePct.ok) return fontSizePct;
  const fontWeight = optNumber(rec.fontWeight, 100, 900, "fontWeight");
  if (!fontWeight.ok) return fontWeight;
  const lineHeight = optNumber(rec.lineHeight, 0.8, 3, "lineHeight");
  if (!lineHeight.ok) return lineHeight;
  const maxLines = optNumber(rec.maxLines, 1, 20, "maxLines");
  if (!maxLines.ok) return maxLines;
  const strokeWidthPct = optNumber(rec.strokeWidthPct, 0, 20, "strokeWidthPct");
  if (!strokeWidthPct.ok) return strokeWidthPct;
  const cornerRadiusPct = optNumber(rec.cornerRadiusPct, 0, 50, "cornerRadiusPct");
  if (!cornerRadiusPct.ok) return cornerRadiusPct;
  if (rec.textAlign != null && !isIn(INTRO_TEXT_ALIGNS, rec.textAlign)) {
    return { ok: false, error: "textAlign_invalid" };
  }
  const color = optHex(rec.color, "color");
  if (!color.ok) return color;
  const fillColor = optHex(rec.fillColor, "fillColor");
  if (!fillColor.ok) return fillColor;
  const strokeColor = optHex(rec.strokeColor, "strokeColor");
  if (!strokeColor.ok) return strokeColor;
  const animation = validateAnimation(rec.animation);
  if (!animation.ok) return animation;

  const needsAsset = rec.type === "IMAGE" || rec.type === "LOGO" || rec.decorationKind === "sticker";
  if (needsAsset && !rec.assetId) return { ok: false, error: "layer_asset_required" };
  if (rec.type === "BACKGROUND" && !rec.assetId && !color.value && !fillColor.value) {
    return { ok: false, error: "layer_background_required" };
  }
  if (rec.type === "TEXT" && !String(rec.text ?? "").trim()) return { ok: false, error: "layer_text_required" };

  return {
    ok: true,
    value: {
      id: rec.id.trim(),
      type: rec.type,
      zIndex: rec.zIndex,
      anchor: rec.anchor,
      name: typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : undefined,
      visible: typeof rec.visible === "boolean" ? rec.visible : undefined,
      xPct: xPct.value,
      yPct: yPct.value,
      widthPct: widthPct.value,
      heightPct: heightPct.value,
      minWidthPct: minWidthPct.value,
      maxWidthPct: maxWidthPct.value,
      opacity: opacity.value,
      rotation: rotation.value,
      safeArea: typeof rec.safeArea === "boolean" ? rec.safeArea : undefined,
      aspectPolicy: isIn(INTRO_ASPECT_POLICIES, rec.aspectPolicy) ? rec.aspectPolicy : undefined,
      assetId: typeof rec.assetId === "string" ? rec.assetId : undefined,
      text: typeof rec.text === "string" ? rec.text : undefined,
      fontToken: isIn(INTRO_FONT_TOKENS, rec.fontToken) ? rec.fontToken : undefined,
      fontSizePct: fontSizePct.value,
      fontWeight: fontWeight.value,
      lineHeight: lineHeight.value,
      textAlign: isIn(INTRO_TEXT_ALIGNS, rec.textAlign) ? rec.textAlign : undefined,
      wrap: typeof rec.wrap === "boolean" ? rec.wrap : undefined,
      maxLines: maxLines.value,
      color: color.value,
      fillColor: fillColor.value,
      strokeColor: strokeColor.value,
      strokeWidthPct: strokeWidthPct.value,
      cornerRadiusPct: cornerRadiusPct.value,
      decorationKind: isIn(INTRO_DECORATION_KINDS, rec.decorationKind) ? rec.decorationKind : undefined,
      animation: animation.value,
    },
  };
}

export function validateIntroLayers(raw: unknown): ContractResult<IntroLayer[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "layers_not_array" };
  const out: IntroLayer[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    const layer = validateIntroLayer(item);
    if (!layer.ok) return layer;
    if (ids.has(layer.value.id)) return { ok: false, error: "layer_id_duplicate" };
    ids.add(layer.value.id);
    out.push(layer.value);
  }
  return { ok: true, value: out };
}
