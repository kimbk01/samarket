"use client";

import { AdminCard } from "@/components/admin/AdminCard";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { translateBy } from "@/lib/i18n/translate-by";

/** `GET /api/admin/feed-ad-requests/[id]/audit` 의 한 행 */
export type AdminFeedAdAuditRow = {
  id: string;
  action: string;
  actor_type: string;
  created_at: string;
  after_json?: unknown;
};

/** 감사 이름 하나 (AD-206 · `feed-ad-admin-actions.ts` FEED_AD_ADMIN_AUDIT_ACTIONS) → 한국어 */
const ACTION_LABEL: Record<string, { ko: string; en: string }> = {
  "feed_ad_request.approve": { ko: "승인", en: "Approved" },
  "feed_ad_request.reject": { ko: "반려", en: "Rejected" },
  "feed_ad_request.pause": { ko: "운영자 정지", en: "Paused by operator" },
  "feed_ad_request.resume": { ko: "운영자 재개", en: "Resumed by operator" },
  "feed_ad_request.end": { ko: "운영자 종료", en: "Ended by operator" },
  "feed_ad_request.extend_compensation": { ko: "보상 연장", en: "Compensation extension" },
  "feed_ad_request.update": { ko: "신청 내용 수정", en: "Request edited" },
  "feed_ad_request.replace_creative": { ko: "이미지 교체", en: "Image replaced" },
};

const ACTOR_LABEL: Record<string, { ko: string; en: string }> = {
  admin: { ko: "운영자", en: "Operator" },
  user: { ko: "회원", en: "Member" },
  member: { ko: "회원", en: "Member" },
  system: { ko: "시스템", en: "System" },
};

const FAULT_LABEL: Record<string, { ko: string; en: string }> = {
  operator: { ko: "운영 사유", en: "Operator" },
  member: { ko: "회원 사유", en: "Member" },
  none: { ko: "해당 없음", en: "None" },
};

export function adminFeedAdAuditActionLabel(action: string, lang: "ko" | "en"): string {
  const hit = ACTION_LABEL[String(action ?? "").trim()];
  if (hit) return hit[lang];
  return translateBy(lang, "admin_other_change");
}

function after(row: AdminFeedAdAuditRow): Record<string, unknown> {
  return row.after_json && typeof row.after_json === "object" ? (row.after_json as Record<string, unknown>) : {};
}

/**
 * 피드 신청 상세 감사 이력 블록 — 팝업·PTR 상세 `AdminPlatformPopupAuditHistory` 와 같은 모양(카드 · 시각 · 조치 · 주체),
 * 거기에 공개 사유·귀책·환급을 한 줄 더 보인다. 코드값은 화면에 보이지 않는다.
 */
export function AdminFeedAdAuditHistory({
  items,
  lang,
}: {
  items: readonly AdminFeedAdAuditRow[];
  lang: "ko" | "en";
}) {
  return (
    <AdminCard>
      <h2 className="mb-2 text-sm font-semibold">{translateBy(lang, "admin_campaign_cms_audit_title")}</h2>
      <ul className="max-h-48 space-y-1 overflow-auto text-xs" data-admin-feed-audit-history="">
        {items.length === 0 ? (
          <li className="text-sam-muted">—</li>
        ) : (
          items.map((row) => {
            const a = after(row);
            const reason = typeof a.reason_public === "string" ? a.reason_public : typeof a.reason === "string" ? a.reason : "";
            const internal = typeof a.reason_internal === "string" ? a.reason_internal : "";
            const fault = typeof a.fault === "string" ? FAULT_LABEL[a.fault]?.[lang] ?? "" : "";
            const refund = typeof a.refund_amount === "number" ? a.refund_amount : null;
            const actor = ACTOR_LABEL[String(row.actor_type ?? "").trim()]?.[lang] ?? (translateBy(lang, "admin_menu_bottom_icon_cat_misc"));
            return (
              <li key={row.id} data-audit-action={row.action}>
                {formatAdminManilaDateTime(row.created_at)} · {adminFeedAdAuditActionLabel(row.action, lang)} · {actor}
                {reason || fault || refund != null || internal ? (
                  <span className="block pl-2 text-sam-muted">
                    {[
                      reason ? (translateBy(lang, "admin_public_reason_reason", { reason })) : null,
                      internal ? (translateBy(lang, "admin_internal_memo_internal", { internal })) : null,
                      fault ? (translateBy(lang, "admin_fault_fault", { fault })) : null,
                      refund != null ? (translateBy(lang, "admin_refund_refund_p", { refund })) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </AdminCard>
  );
}
