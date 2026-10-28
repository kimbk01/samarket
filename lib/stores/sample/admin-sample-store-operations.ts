/**
 * HC-1 — 샘플 매장 운영 설정(배달·포장·배달비·최소주문·무료배달 기준·조리시간·영업시간·결제수단) 검증·정규화.
 * 사장님 매장 저장과 같은 정규화 함수(`normalizeStoreBusinessHoursJsonForWrite`)로 `business_hours_json` 을 만든다.
 * 순수 함수 — 관리자 샘플 PATCH·테스트 공용.
 */
import { normalizeStoreBusinessHoursJsonForWrite } from "@/lib/stores/owner-store-patch-fields";

export type AdminSampleOperationsInput = {
  deliveryAvailable?: unknown;
  pickupAvailable?: unknown;
  deliveryFeePhp?: unknown;
  minOrderPhp?: unknown;
  freeDeliveryOverPhp?: unknown;
  prepTimeMinutes?: unknown;
  openTime?: unknown;
  closeTime?: unknown;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function money(v: unknown): number | null | "invalid" {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n) : "invalid";
}

export function hasAdminSampleOperationsFields(body: AdminSampleOperationsInput): boolean {
  return (
    body.deliveryAvailable !== undefined ||
    body.pickupAvailable !== undefined ||
    body.deliveryFeePhp !== undefined ||
    body.minOrderPhp !== undefined ||
    body.freeDeliveryOverPhp !== undefined ||
    body.prepTimeMinutes !== undefined ||
    body.openTime !== undefined ||
    body.closeTime !== undefined
  );
}

/** 현재 행 + 입력 → stores UPDATE 칸. 배달을 켜려면 매장 위치(lat/lng)가 있어야 한다(DB 트리거와 같은 규칙) */
export function buildAdminSampleOperationsPatch(
  current: { business_hours_json: unknown; lat: unknown; lng: unknown },
  body: AdminSampleOperationsInput
): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};
  const hours: Record<string, unknown> = {
    ...((current.business_hours_json && typeof current.business_hours_json === "object"
      ? current.business_hours_json
      : {}) as Record<string, unknown>),
  };
  if (body.deliveryAvailable !== undefined) {
    if (typeof body.deliveryAvailable !== "boolean") return { ok: false, error: "invalid_delivery_available" };
    if (body.deliveryAvailable && (current.lat == null || current.lng == null)) {
      return { ok: false, error: "store_delivery_requires_canonical_geo" };
    }
    patch.delivery_available = body.deliveryAvailable;
  }
  if (body.pickupAvailable !== undefined) {
    if (typeof body.pickupAvailable !== "boolean") return { ok: false, error: "invalid_pickup_available" };
    patch.pickup_available = body.pickupAvailable;
  }
  for (const [key, col] of [
    ["deliveryFeePhp", "delivery_fee_php"],
    ["minOrderPhp", "min_order_php"],
    ["freeDeliveryOverPhp", "free_delivery_over_php"],
  ] as const) {
    if (body[key] === undefined) continue;
    const v = money(body[key]);
    if (v === "invalid") return { ok: false, error: `invalid_${col}` };
    if (v == null) delete hours[col];
    else hours[col] = v;
    if (col === "delivery_fee_php" && v != null) hours.delivery_fee_mode = "self";
  }
  if (body.prepTimeMinutes !== undefined) {
    const n = Number(body.prepTimeMinutes);
    if (!Number.isInteger(n) || n < 1 || n > 180) return { ok: false, error: "invalid_prep_time_minutes" };
    hours.prep_time_minutes = n;
  }
  if (body.openTime !== undefined || body.closeTime !== undefined) {
    const prev = (hours.auto_business_hours ?? {}) as Record<string, unknown>;
    const open = String(body.openTime ?? prev.open ?? "").trim();
    const close = String(body.closeTime ?? prev.close ?? "").trim();
    if (!HHMM.test(open) || !HHMM.test(close) || open === close) return { ok: false, error: "invalid_business_hours" };
    hours.auto_business_hours = { ...prev, enabled: true, schedule_enforced: true, timezone: "Asia/Manila", open, close };
  }
  const normalized = normalizeStoreBusinessHoursJsonForWrite(hours);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  patch.business_hours_json = normalized.value;
  return { ok: true, patch };
}
