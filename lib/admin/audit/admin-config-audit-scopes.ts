/**
 * 배달 설정·구성 화면 「처리 이력」 범위 (DEF-2 · DEF-40 · DEF-45).
 * 클라이언트·서버 공용 (서버 전용 모듈 import 금지).
 * 각 범위는 해당 쓰기 API 가 `audit_logs.target_type` 으로 남기는 값과 1:1 이어야 한다.
 */

import type { MessageKey } from "@/lib/i18n/messages";

export const ADMIN_CONFIG_AUDIT_SCOPES = {
  fee_policy: ["store_fee_policy"],
  browse_policy: ["stores_browse_scope_policy"],
  home_shelves: ["stores_home_shelves"],
  bottom_nav: ["delivery_bottom_nav_item"],
  taxonomy: ["store_taxonomy", "store_categories", "store_topics", "store_subtopics"],
  discovery: ["store_discovery_campaign"],
  delivery_settings: ["delivery_ops_settings"],
  commerce_settings: ["commerce_settings"],
  auto_actions_runtime: ["delivery_auto_actions_runtime_settings"],
  alert_rules: ["delivery_operation_alert_rule"],
} as const satisfies Record<string, readonly string[]>;

export type AdminConfigAuditScope = keyof typeof ADMIN_CONFIG_AUDIT_SCOPES;

export function parseAdminConfigAuditScope(raw: string | null | undefined): AdminConfigAuditScope | null {
  const s = String(raw ?? "").trim();
  return Object.prototype.hasOwnProperty.call(ADMIN_CONFIG_AUDIT_SCOPES, s) ? (s as AdminConfigAuditScope) : null;
}

export type AdminConfigAuditRow = {
  id: string;
  created_at: string;
  action: string;
  target_type: string;
  target_id: string;
  actor_id: string | null;
  actor_label: string | null;
  reason: string | null;
  before_json: unknown;
  after_json: unknown;
};

/** 감사 action → 운영 문구 키 (원시 action 은 기술 정보로만). */
const ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  "store_fee_policy.create": "admin_r4c_audit_fee_create",
  "store_fee_policy.update": "admin_r4c_audit_fee_update",
  "store_fee_policy.supersede": "admin_r4c_audit_fee_supersede",
  "store_fee_policy.archive": "admin_r4c_audit_fee_archive",
  "stores_category_policy.update": "admin_r4c_audit_browse_update",
  "stores_home_shelves.update": "admin_r4c_audit_shelves_update",
  "delivery_bottom_nav.create": "admin_r4c_audit_nav_create",
  "delivery_bottom_nav.update": "admin_r4c_audit_nav_update",
  "delivery_bottom_nav.delete": "admin_r4c_audit_nav_delete",
  "delivery_bottom_nav.reorder": "admin_r4c_audit_nav_reorder",
  "store_taxonomy.create": "admin_r4c_audit_taxonomy_create",
  "store_taxonomy.update": "admin_r4c_audit_taxonomy_update",
  "store_discovery_campaign.create": "admin_r4c_audit_discovery_create",
  "store_discovery_campaign.update": "admin_r4c_audit_discovery_update",
  "commerce_settings.update": "admin_r4c_audit_commerce_update",
};

export function adminConfigAuditActionKey(action: string): MessageKey {
  const hit = ACTION_LABEL_KEYS[action];
  if (hit) return hit;
  if (/\.create$/.test(action)) return "admin_r4c_audit_generic_create";
  if (/\.(delete|archive)$/.test(action)) return "admin_r4c_audit_generic_delete";
  return "admin_r4c_audit_generic_update";
}

/** after_json.reason / change_reason / archive_reason 중 첫 값. */
export function extractAdminAuditReason(after: unknown, before?: unknown): string | null {
  for (const src of [after, before]) {
    if (!src || typeof src !== "object") continue;
    const o = src as Record<string, unknown>;
    for (const k of ["reason", "change_reason", "archive_reason", "admin_note"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 1000);
    }
  }
  return null;
}
