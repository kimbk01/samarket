"use client";

import { AdminCard } from "@/components/admin/AdminCard";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { translateBy } from "@/lib/i18n/translate-by";

/** `GET /api/admin/platform-popup-campaigns/[id]/audit` 의 한 행 */
export type AdminPlatformPopupAuditRow = {
  id: string;
  action: string;
  actor_type: string;
  created_at: string;
  after_json?: unknown;
};

const ACTION_LABEL: Record<string, { ko: string; en: string }> = {
  "platform_popup.create": { ko: "만듦", en: "Created" },
  "platform_popup.update": { ko: "설정 저장", en: "Settings saved" },
  "platform_popup.material_edit_review": { ko: "노출 조건 변경 → 다시 검토", en: "Material edit → back to review" },
  "platform_popup.transition": { ko: "상태 변경", en: "Status changed" },
  "platform_popup.copy": { ko: "복사", en: "Copied" },
  "platform_popup.creative_changed": { ko: "이미지 교체", en: "Image replaced" },
  "platform_popup.creative_removed": { ko: "이미지 삭제", en: "Image removed" },
  "platform_popup.delete_draft": { ko: "초안 삭제", en: "Draft deleted" },
};

const ACTOR_LABEL: Record<string, { ko: string; en: string }> = {
  admin: { ko: "관리자", en: "Admin" },
  owner: { ko: "사장님", en: "Owner" },
  system: { ko: "시스템", en: "System" },
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
