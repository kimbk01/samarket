/**
 * 커뮤니티 운영 기록 표시 라벨 (설계 §C-20 · §E-7) — 조치·대상 유형을 한국어로, 대상 화면 링크로.
 * 원시 action·target_type 은 화면 1차 정보로 쓰지 않는다 (기술 정보에서만). Client-safe.
 */

import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 라벨 번역 함수 — 화면은 `useI18n().t` 를 넘긴다. 생략하면 한국어(기존 호출부 동작 유지) */
export type AuditTr = (key: MessageKey) => string;
const AUDIT_KO: AuditTr = (key) => translate("ko", key);

/** 정확히 일치하는 조치 */
const ACTION_EXACT: Record<string, MessageKey> = {
  "community_post.status_hidden": "admin_community_audit_action_post_hidden",
  "community_post.status_active": "admin_community_audit_action_post_reopened",
  "community_post.status_deleted": "admin_community_audit_action_post_deleted",
  "community_post.hard_delete": "admin_community_audit_action_post_hard_deleted",
  "community_post.content_update": "admin_community_audit_action_post_admin_edit",
  "community_post.image_delete": "admin_community_audit_action_post_image_deleted",
  "community_post.update": "admin_community_audit_action_post_info_changed",
  "community_post.pin": "admin_community_audit_action_post_pinned",
  "community_post.unpin": "admin_community_audit_action_post_unpinned",
  "community_comment.status_hidden": "admin_community_audit_action_comment_hidden",
  "community_comment.status_active": "admin_community_audit_action_comment_reopened",
  "community_comment.status_deleted": "admin_community_audit_action_comment_deleted",
  "community_report.decision": "admin_community_audit_action_report_decision",
  "community_sanction.apply_warning": "admin_community_audit_action_warning",
  "community_sanction.apply_community_restriction": "admin_community_audit_action_restriction",
  "community_sanction.revoke": "admin_community_audit_action_restriction_lifted",
  "community_promotion_order.pause": "admin_community_audit_action_promo_paused",
  "community_promotion_order.resume": "admin_community_audit_action_promo_resumed",
  "community_promotion_order.end": "admin_community_audit_action_promo_ended",
  "point_promotion_order.end": "admin_community_audit_action_promo_ended",
  "point_promotion_order.pause": "admin_community_audit_action_promo_paused",
  "point_promotion_order.resume": "admin_community_audit_action_promo_resumed",
  admin_point_credit: "admin_community_audit_action_point_credit",
  admin_point_debit: "admin_community_audit_action_point_debit",
  admin_point_reconcile: "admin_community_audit_action_point_reconcile",
  approve: "admin_community_audit_action_charge_approved",
  approved: "admin_community_audit_action_charge_approved",
  rejected: "admin_community_audit_action_charge_rejected",
  on_hold: "admin_community_audit_action_charge_on_hold",
  admin_memo_update: "admin_community_audit_action_charge_memo_edit",
  "community_topic.create": "admin_community_audit_action_topic_created",
  "community_topic.update": "admin_community_audit_action_topic_changed",
  "community_topic.delete": "admin_community_audit_action_topic_deleted",
  "community_section.create": "admin_community_audit_action_section_created",
  "community_section.update": "admin_community_audit_action_section_changed",
  "community_section.delete": "admin_community_audit_action_section_deleted",
  "community_settings.update": "admin_community_audit_action_settings_changed",
  "community_settings.neighborhood_section_update": "admin_community_audit_action_settings_changed",
  "community_settings.neighborhood_filter_update": "admin_community_audit_action_settings_changed",
  "community_notice.create": "admin_community_audit_action_notice_created",
  "community_notice.update": "admin_community_audit_action_notice_updated",
  "community_notice.end": "admin_community_audit_action_notice_ended",
  "community_import.job_create": "admin_community_audit_action_import_job_started",
  "community_import.job_cancel": "admin_community_audit_action_import_job_cancelled",
  "community_import.job_retry_failed": "admin_community_audit_action_import_job_retried",
  "community_import.inbox_status": "admin_community_audit_action_import_status_changed",
  "community_import.draft_save": "admin_community_audit_action_import_draft_edited",
  "community_import.rule_toggle": "admin_community_audit_action_import_rule_toggled",
};

/** 접두 일치 (위에서 못 찾을 때) */
const ACTION_PREFIX: [string, MessageKey][] = [
  ["community_topic.", "admin_community_audit_action_topic_changed"],
  ["community_section.", "admin_community_audit_action_section_changed"],
  ["community_settings.", "admin_community_audit_action_settings_changed"],
  ["community_import", "admin_community_audit_action_import_changed"],
  ["community_notice.", "admin_community_audit_action_notice_changed"],
  ["community_post.", "admin_community_audit_action_post_action"],
  ["community_comment.", "admin_community_audit_action_comment_action"],
];

export function communityAuditActionLabel(action: string | null | undefined, t: AuditTr = AUDIT_KO): string {
  const a = String(action ?? "").trim();
  if (!a) return t("admin_community_audit_action_other_action");
  const hit = ACTION_EXACT[a];
  if (hit) return t(hit);
  for (const [p, label] of ACTION_PREFIX) if (a.startsWith(p)) return t(label);
  return t("admin_community_audit_action_other_action");
}

/** 대상 유형 (필터 선택지 순서) */
export const COMMUNITY_AUDIT_TARGET_LABELS: { value: string; labelKey: MessageKey }[] = [
  { value: "community_post", labelKey: "admin_community_audit_target_post" },
  { value: "community_comment", labelKey: "admin_community_audit_target_comment" },
  { value: "community_report", labelKey: "admin_community_audit_target_report" },
  { value: "community_sanction", labelKey: "admin_community_audit_target_community_sanction" },
  { value: "sanction", labelKey: "admin_community_audit_target_sanction" },
  { value: "community_topic", labelKey: "admin_community_audit_target_topic" },
  { value: "community_section", labelKey: "admin_community_audit_target_section" },
  { value: "community_settings", labelKey: "admin_community_audit_target_settings" },
  { value: "community_notice", labelKey: "admin_community_audit_target_notice" },
  { value: "community_promotion_order", labelKey: "admin_community_audit_target_post_promotion" },
  { value: "point_promotion_order", labelKey: "admin_community_audit_target_promotion_order" },
  { value: "user_points", labelKey: "admin_community_audit_target_user_points" },
  { value: "point_charge_request", labelKey: "admin_community_audit_target_charge_request" },
];

export function communityAuditTargetLabel(type: string | null | undefined, t: AuditTr = AUDIT_KO): string {
  const s = String(type ?? "");
  const hit = COMMUNITY_AUDIT_TARGET_LABELS.find((x) => x.value === s);
  if (hit) return t(hit.labelKey);
  if (s.startsWith("community_import")) return t("admin_community_audit_target_import");
  return t("admin_community_audit_target_other");
}

/** 대상 → Admin 화면 링크 (없으면 null) */
export function communityAuditTargetHref(type: string | null | undefined, id: string | null | undefined): string | null {
  const t = String(type ?? "");
  const raw = String(id ?? "").trim();
  const enc = encodeURIComponent(raw);
  switch (t) {
    case "community_post":
      return raw ? `/admin/community/posts/${enc}` : "/admin/community/posts";
    case "community_comment":
      return raw ? `/admin/community/comments?commentId=${enc}` : "/admin/community/comments";
    case "community_report":
      return raw ? `/admin/community/reports?reportId=${enc}` : "/admin/community/reports";
    case "community_sanction":
    case "sanction":
      return raw ? `/admin/community/restrictions?sanctionId=${enc}` : "/admin/community/restrictions";
    case "community_topic":
      return "/admin/community/topics";
    case "community_section":
      return "/admin/community/sections";
    case "community_settings":
      return "/admin/community/settings";
    case "community_notice":
      return "/admin/community/notices";
    case "community_promotion_order":
    case "point_promotion_order":
      return "/admin/community/promotions?tab=all";
    case "user_points":
      return raw ? `/admin/community/points?userId=${enc}&period=all` : "/admin/community/points";
    case "point_charge_request":
      return "/admin/community/point-charges?status=all";
    default:
      return t.startsWith("community_import") ? "/admin/community/external-import" : null;
  }
}

/** 전후 비교에서 보여 줄 필드 이름 (모르는 키는 그대로 기술 정보로) */
const FIELD_LABELS: Record<string, MessageKey> = {
  status: "admin_community_audit_field_status",
  title: "admin_community_audit_field_title",
  content: "admin_community_audit_field_content",
  topic_id: "admin_community_audit_field_topic_id",
  is_reported: "admin_community_audit_field_is_reported",
  reason: "admin_community_audit_field_reason",
  order_status: "admin_community_audit_field_order_status",
  end_at: "admin_community_audit_field_end_at",
  start_at: "admin_community_audit_field_start_at",
  fault: "admin_community_audit_field_fault",
  refund_points: "admin_community_audit_field_refund_points",
  amount: "admin_community_audit_field_amount",
  request_status: "admin_community_audit_field_request_status",
  restriction: "admin_community_audit_field_restriction",
  sanction_type: "admin_community_audit_field_sanction_type",
  revoked_at: "admin_community_audit_field_revoked_at",
  name: "admin_community_audit_field_name",
  is_active: "admin_community_audit_field_is_active",
  sort_order: "admin_community_audit_field_sort_order",
  pinned_scope: "admin_community_audit_field_pinned_scope",
  decision: "admin_community_audit_field_decision",
};

export function communityAuditFieldLabel(key: string, t: AuditTr = AUDIT_KO): string | null {
  const k = FIELD_LABELS[key];
  return k ? t(k) : null;
}
