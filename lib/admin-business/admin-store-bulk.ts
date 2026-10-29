/**
 * 3-C §9-2 B-2·B-3 — 관리자 매장 일괄 노출·숨김·공통 수정 (순수 · 서버/클라이언트/테스트 공용).
 * 허용 항목 고정: 노출 · 영업 중 여부 · 영업시간 · 배달 반경. 업종·메뉴·이름·이미지·위치는 일괄 대상 아님.
 * 실제 변경은 단건 PATCH 와 같은 `executeAdminStorePatchAction` 이 매장마다 실행한다 (중복 로직 없음).
 */
import type { AdminStorePatchBody } from "@/lib/admin-business/execute-admin-store-patch-action.server";

export const ADMIN_STORE_BULK_ACTIONS = [
  "set_store_visible",
  "set_open",
  "set_business_hours",
  "set_delivery_radius",
] as const;
export type AdminStoreBulkAction = (typeof ADMIN_STORE_BULK_ACTIONS)[number];

export const ADMIN_STORE_BULK_MAX = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAdminStoreBulkAction(v: unknown): v is AdminStoreBulkAction {
  return typeof v === "string" && (ADMIN_STORE_BULK_ACTIONS as readonly string[]).includes(v);
}

export type AdminStoreBulkInput = {
  action?: unknown;
  enabled?: unknown;
  is_open?: unknown;
  business_hours_json?: unknown;
  delivery_radius_km?: unknown;
  reason?: unknown;
};

/** 요청 id → 중복·형식 오류 제거. 상한 초과는 오류. */
export function parseAdminStoreBulkIds(
  raw: unknown,
  max = ADMIN_STORE_BULK_MAX
): { ok: true; ids: string[] } | { ok: false; error: "store_ids_required" | "too_many_store_ids" } {
  if (!Array.isArray(raw)) return { ok: false, error: "store_ids_required" };
  const ids = [...new Set(raw.map((x) => String(x ?? "").trim()).filter((x) => UUID_RE.test(x)))];
  if (ids.length === 0) return { ok: false, error: "store_ids_required" };
  if (ids.length > max) return { ok: false, error: "too_many_store_ids" };
  return { ok: true, ids };
}

/** 일괄 동작 → 단건 PATCH action 본문 (허용 필드만 옮긴다). */
export function buildAdminStoreBulkPatchBody(
  input: AdminStoreBulkInput
): { ok: true; body: AdminStorePatchBody } | { ok: false; error: string } {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!isAdminStoreBulkAction(input.action)) return { ok: false, error: "bulk_action_not_allowed" };
  switch (input.action) {
    case "set_store_visible":
      if (typeof input.enabled !== "boolean") return { ok: false, error: "enabled_required" };
      return { ok: true, body: { action: "set_store_visible", enabled: input.enabled, reason } };
    case "set_open":
      if (typeof input.is_open !== "boolean") return { ok: false, error: "is_open_required" };
      return { ok: true, body: { action: "set_delivery_flags", is_open: input.is_open, reason } };
    case "set_business_hours":
      if (input.business_hours_json === undefined) return { ok: false, error: "business_hours_required" };
      return {
        ok: true,
        body: {
          action: "set_business_hours",
          business_hours_json: input.business_hours_json as Record<string, unknown> | null,
          reason,
        },
      };
    case "set_delivery_radius":
      if (input.delivery_radius_km === undefined) return { ok: false, error: "delivery_radius_km_required" };
      return {
        ok: true,
        body: {
          action: "set_delivery_radius",
          delivery_radius_km: input.delivery_radius_km as number | null,
          reason,
        },
      };
  }
}

export type AdminStoreBulkResult = {
  store_id: string;
  ok: boolean;
  status: number;
  error?: string;
};

export function summarizeAdminStoreBulkResults(results: readonly AdminStoreBulkResult[]): {
  total: number;
  success: number;
  failed: number;
} {
  const success = results.filter((r) => r.ok).length;
  return { total: results.length, success, failed: results.length - success };
}
