"use client";

import { Shield, Store, UserRound, Users } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";
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

function StatCard({
  label,
  value,
  icon,
  iconWrapClass,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconWrapClass: string;
}) {
  return (
    <div className={`${ADMIN_USERS_LITE_CARD} flex items-center gap-4 p-4`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#667085]">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-[#101828]">{value}</p>
      </div>
    </div>
  );
}

export function AdminUserListSummaryCards({ summary }: { summary: Summary }) {
  const { t, language } = useI18n();
  const locale = countLocale(language);
  const dash = t("admin_users_empty_placeholder");
  const fmt = (n: number | null) => (n == null ? dash : n.toLocaleString(locale));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={t("admin_users_lite_stat_total")}
        value={fmt(summary.total)}
        icon={<Users className="h-5 w-5 text-[#2563eb]" aria-hidden />}
        iconWrapClass="bg-[#eff6ff]"
      />
      <StatCard
        label={t("admin_users_lite_role_member")}
        value={fmt(summary.member)}
        icon={<UserRound className="h-5 w-5 text-[#12b76a]" aria-hidden />}
        iconWrapClass="bg-[#ecfdf3]"
      />
      <StatCard
        label={t("admin_users_lite_role_store_manager")}
        value={fmt(summary.storeManager)}
        icon={<Store className="h-5 w-5 text-[#f79009]" aria-hidden />}
        iconWrapClass="bg-[#fff6ed]"
      />
      <StatCard
        label={t("admin_users_lite_role_admin")}
        value={fmt(summary.admin)}
        icon={<Shield className="h-5 w-5 text-[#7f56d9]" aria-hidden />}
        iconWrapClass="bg-[#f9f5ff]"
      />
    </div>
  );
}
