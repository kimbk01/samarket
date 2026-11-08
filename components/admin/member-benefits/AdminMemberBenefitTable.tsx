"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

interface AdminMemberBenefitTableProps {
  policies: MemberBenefitPolicy[];
}

export function AdminMemberBenefitTable({
  policies,
}: AdminMemberBenefitTableProps) {
  const { t } = useI18n();
  if (policies.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_member_benefits_policy_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_member_benefits_col_type")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_member_benefits_col_title")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_member_benefits_col_priority_boost")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_member_benefits_col_points_ads")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_member_benefits_col_status")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_member_benefits_col_updated")}
            </th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">
                {MEMBER_TYPE_LABELS[p.memberType]}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/member-benefits/${p.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {p.title}
                </Link>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t("admin_member_benefits_priority_boost_line", { home: p.homePriorityBoost, search: p.searchPriorityBoost, shop: p.shopFeaturedPriorityBoost })}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t("admin_member_benefits_points_ads_line", { points: (p.pointRewardBonusRate * 100).toFixed(0), ads: (p.adDiscountRate * 100).toFixed(0) })}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    p.isActive
                      ? "bg-sam-success-soft text-sam-success"
                      : "bg-sam-border-soft text-sam-muted"
                  }`}
                >
                  {t(p.isActive ? "common_active" : "admin_member_benefit_inactive")}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDateTime(p.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
