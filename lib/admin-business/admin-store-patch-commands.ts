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
  set_owner_identity_editable: {
    writes: ["stores.owner_can_edit_store_identity"],
    table: "stores",
  },
  set_store_visible: {
    writes: ["stores.is_visible", "stores.first_listed_at"],
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
 * - delivery distance store override: PUT /api/admin/delivery/settings
 * - address/coords: action `set_store_location` on this endpoint AND Owner
 *   PATCH /api/me/stores/[storeId] — both call `buildStoreLocationPatchFields`
 *   (+ checkout geo refresh when lat/lng change). Do not free-form update coords.
 */
export const ADMIN_STORE_MANAGEMENT_EXTERNAL_WRITERS = {
  fee_store_override: "POST|PATCH /api/admin/store-fee-policies",
  delivery_distance_store_override: "PUT /api/admin/delivery/settings",
  address_coords:
    "set_store_location (admin) | PATCH /api/me/stores/[storeId] (owner) via buildStoreLocationPatchFields",
} as const;
