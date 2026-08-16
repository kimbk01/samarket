/**
 * Parse + validate Admin field_composition JSONB overlay.
 * Rejects unknown field ids (must be in Field Library).
 */
import { assertApprovedTradeFieldId } from "./field-library";
import type { TradeCompositionFieldOverlay, TradeFieldCompositionPayload } from "./types";

export function parseTradeFieldCompositionPayload(
  raw: unknown
): TradeFieldCompositionPayload | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (!Array.isArray(o.fields)) return null;

  const fields: TradeCompositionFieldOverlay[] = [];
  for (const item of o.fields) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id || !assertApprovedTradeFieldId(id)) continue;
    const order = typeof row.order === "number" && Number.isFinite(row.order) ? row.order : 0;
    fields.push({
      id,
      active: row.active !== false,
      required: row.required === true,
      order,
    });
  }
  if (fields.length === 0) return null;
  return { v: 1, fields };
}

export function serializeTradeFieldCompositionPayload(
  payload: TradeFieldCompositionPayload
): TradeFieldCompositionPayload {
  const fields = payload.fields
    .filter((f) => assertApprovedTradeFieldId(f.id))
    .map((f) => ({
      id: f.id.trim(),
      active: f.active !== false,
      required: f.required === true,
      order: Number.isFinite(f.order) ? f.order : 0,
    }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { v: 1, fields };
}
