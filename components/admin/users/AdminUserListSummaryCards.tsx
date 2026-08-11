"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";

type Summary = {
  total: number | null;
  member: number | null;
  storeManager: number | null;
  admin: number | null;
};

function countLocale(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export function AdminUserListSummaryCards({ summary }: { summary: Summary }) {
  const { t, language } = useI18n();
  const locale = countLocale(language);
  const dash = t("admin_users_empty_placeholder");
  const fmt = (n: number | null) => (n == null ? dash : n.toLocaleString(locale));

  return (
    <p className="text-[13px] text-[#475467]">
      {t("admin_users_lite_stat_total")} {fmt(summary.total)}
      {" · "}
      {t("admin_users_role_badge_store_owner")} {fmt(summary.storeManager)}
      {" · "}
      {t("admin_users_lite_role_admin")} {fmt(summary.admin)}
    </p>
  );
}
