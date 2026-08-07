"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS, samTier1HeaderIconBadge } from "@/lib/ui/tier1-header-icon";
import { Tier1HeaderBellGlyph } from "@/lib/ui/tier1-header-glyphs";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";

/**
 * 어드민 전용 알림 벨 — Tier1 글리프·뱃지 스타일 통일, /admin/reports 이동.
 */
export function AdminNotificationBell() {
  const { t } = useI18n();
  const { adminBellCount: count } = useAdminStorePointPendingCount();

  return (
    <Link
      href="/admin/reports"
      className={`relative ${SAM_TIER1_HEADER_ACTION_BTN_CLASS}`}
      aria-label={t("admin_order_notif_bell")}
    >
      <Tier1HeaderBellGlyph />
      {count > 0 ? (
        <span className={samTier1HeaderIconBadge}>{count > 99 ? "99+" : count}</span>
      ) : null}
    </Link>
  );
}
