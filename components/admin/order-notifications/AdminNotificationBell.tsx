"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS, samTier1HeaderIconBadge } from "@/lib/ui/tier1-header-icon";
import { Tier1HeaderBellGlyph } from "@/lib/ui/tier1-header-glyphs";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import { formatAdminBellBadge } from "@/lib/admin/admin-action-queue-registry";

/**
 * Admin ops bell — badge SSOT = actionable pending COUNTs from /api/admin/admin-bell (Admin Q).
 * HARD LOCK: digit is business workload, not notification unread.
 * Tap → Action Queue (full Q), not a single-category priority deep-link.
 * View-only does not clear Q; terminal status handling does.
 *
 * Failure contract: incomplete total (a category failed) or a failed refresh shows "!" —
 * a partial sum is never presented as the workload.
 */
export function AdminNotificationBell() {
  const { t, safeT } = useI18n();
  const { adminBellCount: count, queueTotalComplete, queueLoadState } = useAdminStorePointPendingCount();

  const href = "/admin/customer-platform#action-queue";
  const degraded = queueLoadState === "error" || !queueTotalComplete;

  const meaning = degraded
    ? safeT("admin_ops_bell_degraded", {
        fallbackKo: "관리자 처리 업무 일부를 불러오지 못했습니다",
        fallbackEn: "Some admin workload could not be counted",
      })
    : `${safeT("admin_ops_bell_meaning", {
        fallbackKo: "관리자 처리 대기 업무",
        fallbackEn: "Admin tasks waiting",
      })}: ${count}`;

  return (
    <Link
      href={href}
      className={`relative ${SAM_TIER1_HEADER_ACTION_BTN_CLASS}`}
      aria-label={`${t("admin_order_notif_bell")} · ${meaning}`}
      title={meaning}
      data-testid="admin-ops-bell"
      data-admin-bell-state={degraded ? "degraded" : "ok"}
    >
      <Tier1HeaderBellGlyph />
      {degraded ? (
        <span className={samTier1HeaderIconBadge}>!</span>
      ) : count > 0 ? (
        <span className={samTier1HeaderIconBadge}>{formatAdminBellBadge(count)}</span>
      ) : null}
    </Link>
  );
}
