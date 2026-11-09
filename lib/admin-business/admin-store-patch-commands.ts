/**
 * PATCH /api/admin/stores/[id] — command boundary contract.
 * One endpoint, separated action handlers. Do not treat unknown fields as free-form update.
 */

export const ADMIN_STORE_PATCH_COMMANDS = {
  start_review: {
    writes: ["stores.approval_status"],
    table: "stores",
  },
  mark_under_review: {
    writes: ["stores.approval_status"],
    table: "stores",
  },
  /** 게시된 매장 입점 약관이 있으면 동의 기록 필수 · 무료 종료일이 남았으면 승인 전에 0% 매장 정책 생성 */
  approve_store: {
    writes: [
      "stores.approval_status",
      "stores.is_visible",
      "stores.approved_at",
      "stores.rejected_reason",
      "stores.revision_note",
      "stores.suspended_reason",
    ],
    table: "stores",
  },
  reject_store: {
    writes: ["stores.approval_status", "stores.is_visible", "stores.rejected_reason", "stores.revision_note"],
    table: "stores",
  },
  request_revision: {
    writes: ["stores.approval_status", "stores.revision_note"],
    table: "stores",
  },
  suspend_store: {
    writes: ["stores.approval_status", "stores.is_visible", "stores.suspended_reason"],
    table: "stores",
  },
  resume_store: {
    writes: ["stores.approval_status", "stores.suspended_reason"],
    table: "stores",
  },
  /** ACC-04 — 반려 매장 재심사 열기 (rejected → revision_requested, 사유 필수). */
  reopen_application: {
    writes: ["stores.approval_status", "stores.revision_note", "stores.rejected_reason"],
    table: "stores",
  },
  /** ND-2 — 승인 매장 핵심 위치 변경 「재검증 완료」 (pending_reverification → none, CAS). */
  confirm_core_info_reverified: {
    writes: ["stores.core_info_review_status", "stores.core_info_verified_at", "stores.core_info_verified_by"],
    table: "stores",
  },
  set_owner_identity_editable: {
    writes: ["stores.owner_can_edit_store_identity"],
    table: "stores",
  },
  set_store_visible: {
    writes: ["stores.is_visible", "stores.first_listed_at"],
    table: "stores",
  },
  /** HS-07 — 추천 매장 (stores.is_featured + 기간 featured_start_at/featured_end_at). 기존 컬럼, 스키마 변경 없음. */
  set_store_featured: {
    writes: ["stores.is_featured", "stores.featured_start_at", "stores.featured_end_at"],
    table: "stores",
  },
  set_admin_memo: {
    writes: ["stores.admin_internal_memo"],
    table: "stores",
  },
  set_store_name: {
    writes: ["stores.store_name"],
    table: "stores",
  },
  set_store_taxonomy: {
    writes: ["stores.store_category_id", "stores.store_topic_id"],
    table: "stores",
  },
  set_store_contact: {
    writes: ["stores.phone", "stores.description", "stores.email"],
    table: "stores",
  },
  set_store_location: {
    writes: [
      "stores.region",
      "stores.city",
      "stores.district",
      "stores.address_line1",
      "stores.address_line2",
      "stores.place_id",
      "stores.formatted_address",
      "stores.detail_address",
      "stores.lat",
      "stores.lng",
    ],
    table: "stores",
  },
  set_business_hours: {
    writes: ["stores.business_hours_json"],
    table: "stores",
  },
  set_delivery_flags: {
    writes: ["stores.delivery_available", "stores.pickup_available", "stores.is_open"],
    table: "stores",
  },
  set_delivery_radius: {
    writes: ["stores.delivery_radius_km"],
    table: "stores",
  },
  /** DEF-58 — 반경 + 매장 거리 정책 모드를 한 번에 (전역 JSON 은 서버가 이 매장 항목만 병합·버전 비교). */
  set_store_delivery_distance: {
    writes: ["stores.delivery_radius_km", "admin_settings.delivery_store_distance_overrides.stores[store_id]"],
    table: "stores",
  },
  /**
   * 매장 입점 계약 (2026-11-10) — 「이 매장 무료 종료일」 (사유 필수). 계약 기록은 수정 금지라 별도 표에 저장하고,
   * 승인된 매장이면 오픈 기념 무료 정책(store_fee_policies memo 'launch_free') 종료일도 SQL 함수로 바꾼다.
   */
  set_launch_free_until: {
    writes: ["store_launch_free_overrides.*", "store_fee_policies[memo=launch_free].ends_at"],
    table: "store_launch_free_overrides",
  },
  approve_sales: {
    writes: ["store_sales_permissions.*"],
    table: "store_sales_permissions",
  },
  reject_sales: {
    writes: ["store_sales_permissions.*"],
    table: "store_sales_permissions",
  },
  suspend_sales: {
    writes: ["store_sales_permissions.*"],
    table: "store_sales_permissions",
  },
} as const;

export type AdminStorePatchAction = keyof typeof ADMIN_STORE_PATCH_COMMANDS;

export function isAdminStorePatchAction(action: string): action is AdminStorePatchAction {
  return Object.prototype.hasOwnProperty.call(ADMIN_STORE_PATCH_COMMANDS, action);
}

/**
 * Out of this PATCH — use existing SSOT APIs / shared domain commands instead:
 * - store fee override: POST|PATCH /api/admin/store-fee-policies
 * - delivery radius SSOT: action `set_delivery_radius` on this endpoint (stores.delivery_radius_km)
 * - address/coords: action `set_store_location` on this endpoint AND Owner
 *   PATCH /api/me/stores/[storeId] — both call `buildStoreLocationPatchFields`
 *   (+ checkout geo refresh when lat/lng change). Do not free-form update coords.
 */
export const ADMIN_STORE_MANAGEMENT_EXTERNAL_WRITERS = {
  fee_store_override: "POST|PATCH /api/admin/store-fee-policies",
  delivery_radius_ssot: "set_delivery_radius (admin) | PATCH /api/me/stores/[storeId] (owner)",
  address_coords:
    "set_store_location (admin) | PATCH /api/me/stores/[storeId] (owner) via buildStoreLocationPatchFields",
} as const;
