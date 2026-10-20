"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";

interface MemberBenefitCardProps {
  policy: MemberBenefitPolicy;
  className?: string;
}

/** 정책 머리(등급 뱃지 · 제목 · 설명) — 혜택 항목은 `MemberBenefitList` 가 행(사용처 링크)으로 그린다(S47). */
export function MemberBenefitCard({ policy, className = "" }: MemberBenefitCardProps) {
  const { t } = useI18n();
  const isPremium = policy.memberType === "premium";
  const isAdmin = policy.memberType === "admin";

  return (
    <div className={`px-4 pb-2 pt-4 md:px-5 ${className}`}>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 sam-text-helper font-medium ${
            isPremium
              ? "bg-sam-warning-soft text-sam-warning"
              : isAdmin
                ? "bg-sam-info-soft text-sam-info"
                : "bg-sam-surface-muted text-sam-fg"
          }`}
        >
          {MEMBER_TYPE_LABELS[policy.memberType]}
        </span>
        {!policy.isActive && (
          <span className="rounded-full bg-sam-border-soft px-2 py-0.5 sam-text-xxs text-sam-muted">
            {t("ui_member_benefit_inactive")}
          </span>
        )}
      </div>
      <h3 className="mt-2 sam-text-body font-semibold text-sam-fg">{policy.title}</h3>
      {policy.description ? (
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{policy.description}</p>
      ) : null}
    </div>
  );
}
