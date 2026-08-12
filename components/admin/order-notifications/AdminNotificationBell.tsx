"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS, samTier1HeaderIconBadge } from "@/lib/ui/tier1-header-icon";
import { Tier1HeaderBellGlyph } from "@/lib/ui/tier1-header-glyphs";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";

/**
 * Admin ops bell — badge SSOT = pending-action COUNTs from /api/admin/admin-bell.
 * Tap → Action Queue (full Q), not a single-category priority deep-link.
 */
export function AdminNotificationBell() {
  const { t } = useI18n();
  const { adminBellCount: count } = useAdminStorePointPendingCount();

  const href = "/admin/customer-platform#action-queue";

  return (
    <Link
      href={href}
      className={`relative ${SAM_TIER1_HEADER_ACTION_BTN_CLASS}`}
      aria-label={t("admin_order_notif_bell")}
      data-testid="admin-ops-bell"
    >
      <Tier1HeaderBellGlyph />
      {count > 0 ? (
        <span className={samTier1HeaderIconBadge}>{count > 99 ? "99+" : count}</span>
      ) : null}
    </Link>
  );
}
