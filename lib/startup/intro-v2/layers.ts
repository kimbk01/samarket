import {
  INTRO_ASPECT_POLICIES,
  INTRO_LAYER_ANCHORS,
  INTRO_LAYER_TYPES,
  isIn,
  type ContractResult,
  type IntroLayer,
} from "@/lib/startup/intro-v2/types";

const LAYER_KEYS = new Set([
  "id",
  "type",
  "zIndex",
  "anchor",
  "xPct",
  "yPct",
  "widthPct",
  "minWidthPct",
  "maxWidthPct",
  "opacity",
  "rotation",
  "safeArea",
  "aspectPolicy",
  "assetId",
  "text",
  "animation",
]);

function optNumber(value: unknown, min: number, max: number, label: string): ContractResult<number | undefined> {
  if (value == null) return { ok: true, value: undefined };
  if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, error: `${label}_not_number` };
  if (value < min || value > max) return { ok: false, error: `${label}_out_of_range` };
  return { ok: true, value };
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
  if (rec.aspectPolicy != null && !isIn(INTRO_ASPECT_POLICIES, rec.aspectPolicy)) {
    return { ok: false, error: "aspect_policy_invalid" };
  }
  if (rec.assetId != null && (typeof rec.assetId !== "string" || !rec.assetId.trim())) {
    return { ok: false, error: "assetId_invalid" };
  }
  if (rec.text != null && typeof rec.text !== "string") return { ok: false, error: "text_invalid" };
  if (rec.animation != null && typeof rec.animation !== "string") return { ok: false, error: "animation_invalid" };

  const needsAsset = rec.type === "BACKGROUND" || rec.type === "IMAGE" || rec.type === "LOGO" || rec.type === "DECORATION";
  if (needsAsset && !rec.assetId) return { ok: false, error: "layer_asset_required" };
  if (rec.type === "TEXT" && !String(rec.text ?? "").trim()) return { ok: false, error: "layer_text_required" };

  return {
    ok: true,
    value: {
      id: rec.id.trim(),
      type: rec.type,
      zIndex: rec.zIndex,
      anchor: rec.anchor,
      xPct: xPct.value,
      yPct: yPct.value,
      widthPct: widthPct.value,
      minWidthPct: minWidthPct.value,
      maxWidthPct: maxWidthPct.value,
      opacity: opacity.value,
      rotation: rotation.value,
      safeArea: typeof rec.safeArea === "boolean" ? rec.safeArea : undefined,
      aspectPolicy: isIn(INTRO_ASPECT_POLICIES, rec.aspectPolicy) ? rec.aspectPolicy : undefined,
      assetId: typeof rec.assetId === "string" ? rec.assetId : undefined,
      text: typeof rec.text === "string" ? rec.text : undefined,
      animation: typeof rec.animation === "string" ? rec.animation : undefined,
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
