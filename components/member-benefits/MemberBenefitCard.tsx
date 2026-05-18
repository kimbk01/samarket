"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";

interface MemberBenefitCardProps {
  policy: MemberBenefitPolicy;
  className?: string;
}

export function MemberBenefitCard({ policy, className = "" }: MemberBenefitCardProps) {
  const { t } = useI18n();
  const isPremium = policy.memberType === "premium";
  const isAdmin = policy.memberType === "admin";

  return (
    <div
      className={`rounded-ui-rect border bg-sam-surface p-4 ${
        isPremium
          ? "border-amber-200 bg-amber-50/30"
          : isAdmin
            ? "border-indigo-200 bg-indigo-50/30"
            : "border-sam-border"
      } ${className}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 sam-text-helper font-medium ${
            isPremium
              ? "bg-amber-100 text-amber-800"
              : isAdmin
                ? "bg-indigo-100 text-indigo-800"
                : "bg-sam-surface-muted text-sam-fg"
          }`}
        >
          {MEMBER_TYPE_LABELS[policy.memberType]}
        </span>
        {!policy.isActive && (
          <span className="rounded bg-sam-border-soft px-2 py-0.5 sam-text-xxs text-sam-muted">
            {t("ui_member_benefit_inactive")}
          </span>
        )}
      </div>
      <h3 className="mt-2 sam-text-body font-semibold text-sam-fg">
        {policy.title}
      </h3>
      {policy.description && (
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{policy.description}</p>
      )}
      <ul className="mt-3 space-y-1 sam-text-body-secondary text-sam-fg">
        {policy.badgeLabel && (
          <li>{t("ui_member_benefit_profile_badge", { label: policy.badgeLabel })}</li>
        )}
        {(policy.homePriorityBoost > 0 || policy.searchPriorityBoost > 0 || policy.shopFeaturedPriorityBoost > 0) && (
          <li>
            {t("ui_member_benefit_priority_boost", {
              home: policy.homePriorityBoost,
              search: policy.searchPriorityBoost,
              shop: policy.shopFeaturedPriorityBoost,
            })}
          </li>
        )}
        {policy.pointRewardBonusRate > 0 && (
          <li>{t("ui_member_benefit_point_bonus", { rate: (policy.pointRewardBonusRate * 100).toFixed(0) })}</li>
        )}
        {policy.adDiscountRate > 0 && (
          <li>{t("ui_member_benefit_ad_discount", { rate: (policy.adDiscountRate * 100).toFixed(0) })}</li>
        )}
        {policy.canOpenBusinessProfile && (
          <li>{t("ui_member_benefit_can_open_shop")}</li>
        )}
        {policy.canAccessPremiumPromotion && (
          <li>{t("ui_member_benefit_premium_promo")}</li>
        )}
      </ul>
    </div>
  );
}
