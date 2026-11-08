"use client";

import { AdminCard } from "@/components/admin/AdminCard";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { translateBy } from "@/lib/i18n/translate-by";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/** `GET /api/admin/platform-popup-campaigns/[id]/audit` 의 한 행 */
export type AdminPlatformPopupAuditRow = {
  id: string;
  action: string;
  actor_type: string;
  created_at: string;
  after_json?: unknown;
};

const ACTION_LABEL: Record<string, { ko: string; en: string }> = {
  "platform_popup.create": catalogPair("admin_created"),
  "platform_popup.update": catalogPair("admin_settings_saved_2"),
  "platform_popup.material_edit_review": catalogPair("admin_material_edit_back_to_review"),
  "platform_popup.transition": catalogPair("admin_status_changed"),
  "platform_popup.copy": catalogPair("admin_copied"),
  "platform_popup.creative_changed": catalogPair("admin_image_replaced"),
  "platform_popup.creative_removed": catalogPair("admin_image_removed"),
  "platform_popup.delete_draft": catalogPair("admin_draft_deleted"),
};

const ACTOR_LABEL: Record<string, { ko: string; en: string }> = {
  admin: catalogPair("admin_admin"),
  owner: catalogPair("admin_r4a_actor_owner"),
  system: catalogPair("admin_system"),
};

export function adminPlatformPopupAuditActionLabel(action: string, lang: "ko" | "en"): string {
  const hit = ACTION_LABEL[String(action ?? "").trim()];
  if (hit) return hit[lang];
  return translateBy(lang, "admin_other_change");
}

function actorLabel(actorType: string, lang: "ko" | "en"): string {
  const hit = ACTOR_LABEL[String(actorType ?? "").trim()];
  return hit ? hit[lang] : translateBy(lang, "admin_menu_bottom_icon_cat_misc");
}

/**
 * 팝업·PTR 상세 공용 감사 이력 블록 — 같은 `/audit` API 결과를 같은 모양으로 보인다(코드값은 화면에 보이지 않음).
 */
export function AdminPlatformPopupAuditHistory({
  items,
  lang,
}: {
  items: readonly AdminPlatformPopupAuditRow[];
  lang: "ko" | "en";
}) {
  return (
    <AdminCard>
      <h2 className="mb-2 text-sm font-semibold">{translateBy(lang, "admin_campaign_cms_audit_title")}</h2>
      <ul className="max-h-48 space-y-1 overflow-auto text-xs" data-admin-popup-audit-history="">
        {items.length === 0 ? (
          <li className="text-sam-muted">—</li>
        ) : (
          items.map((row) => (
            <li key={row.id} data-audit-action={row.action}>
              {formatAdminManilaDateTime(row.created_at)} · {adminPlatformPopupAuditActionLabel(row.action, lang)} ·{" "}
              {actorLabel(row.actor_type, lang)}
            </li>
          ))
        )}
      </ul>
    </AdminCard>
  );
}
