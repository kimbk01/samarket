/**
 * REBUILD 14 — geometry contract interfaces (shared fit semantics).
 * Re-exports fit algorithm; adds normalized frame validation for P1.
 */

export {
  fitContentRegion,
  mapFrame,
  type ContentRegion,
  type DeviceRect,
} from "@/lib/intro/geometry/fit";

export const STARTUP_COMPOSITION_ASPECT = { w: 9, h: 16 } as const;

export type NormalizedFrame = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type GeometryValidation =
  | { readonly ok: true; readonly value: NormalizedFrame }
  | { readonly ok: false; readonly reason: string };

function isFinite01(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

/** Normalized composition frame: origin top-left, sizes in 0..1, must fit inside unit square. */
export function parseNormalizedFrame(raw: unknown): GeometryValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "frame_not_object" };
  }
  const o = raw as Record<string, unknown>;
  const x = Number(o.x);
  const y = Number(o.y);
  const w = Number(o.w);
  const h = Number(o.h);
  if (![x, y, w, h].every(Number.isFinite)) {
    return { ok: false, reason: "frame_not_finite" };
  }
  if (w <= 0 || h <= 0) {
    return { ok: false, reason: "frame_size_non_positive" };
  }
  if (!isFinite01(x) || !isFinite01(y) || !isFinite01(w) || !isFinite01(h)) {
    return { ok: false, reason: "frame_out_of_unit_square" };
  }
  if (x + w > 1 + 1e-9 || y + h > 1 + 1e-9) {
    return { ok: false, reason: "frame_overflow" };
  }
  return { ok: true, value: { x, y, w, h } };
}
