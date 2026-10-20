"use client";

import { BadgePercent, Briefcase, Coins, Megaphone, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyRow } from "@/components/mypage/ds/MyRow";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import {
  resolveMemberBenefitRows,
  type MemberBenefitRow,
  type MemberBenefitRowKind,
} from "@/lib/member-benefits/resolve-member-benefit-rows";
import { MemberBenefitCard } from "./MemberBenefitCard";

interface MemberBenefitListProps {
  policies: MemberBenefitPolicy[];
  /** 빈 문구 — 생략 시 i18n `benefits_empty_list` */
  emptyMessage?: string;
}

const ROW_ICON: Record<MemberBenefitRowKind, LucideIcon> = {
  ad_discount: BadgePercent,
  point_bonus: Coins,
  premium_promotion: Megaphone,
  business_profile: Briefcase,
  exposure_priority: TrendingUp,
  profile_badge: Sparkles,
};

/**
 * 적용 중 혜택 목록 (S47) — 정책별 머리 + 혜택 항목 행.
 * 행 → 사용처(`resolveMemberBenefitRows`, X22). 이동 없는 행은 정보 행(비활성, chevron 없음).
 */
export function MemberBenefitList({ policies, emptyMessage }: MemberBenefitListProps) {
  const { t } = useI18n();

  if (policies.length === 0) {
    return <MyStateView kind="empty" empty={{ title: emptyMessage ?? t("benefits_empty_list") }} />;
  }

  const rowTitle = (row: MemberBenefitRow): string => {
    switch (row.kind) {
      case "ad_discount":
        return t("ui_member_benefit_ad_discount", { rate: row.ratePercent ?? 0 });
      case "point_bonus":
        return t("ui_member_benefit_point_bonus", { rate: row.ratePercent ?? 0 });
      case "premium_promotion":
        return t("ui_member_benefit_premium_promo");
      case "business_profile":
        return t("ui_member_benefit_can_open_shop");
      case "exposure_priority":
        return t("ui_member_benefit_priority_boost", {
          home: row.boosts?.home ?? 0,
          search: row.boosts?.search ?? 0,
          shop: row.boosts?.shop ?? 0,
        });
      case "profile_badge":
      default:
        return t("ui_member_benefit_profile_badge", { label: row.badgeLabel ?? "" });
    }
  };

  return (
    <ul className="space-y-3" data-testid="member-benefit-list">
      {policies.map((p) => {
        const rows = resolveMemberBenefitRows(p);
        return (
          <li key={p.id} className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
            <MemberBenefitCard policy={p} />
            {rows.map((row) => {
              const Icon = ROW_ICON[row.kind];
              const icon = <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />;
              return row.href ? (
                <MyRow
                  key={row.key}
                  href={row.href}
                  icon={icon}
                  title={rowTitle(row)}
                  testId={`member-benefit-row-${row.kind}`}
                />
              ) : (
                <div
                  key={row.key}
                  data-testid={`member-benefit-row-${row.kind}`}
                  data-benefit-info-row="1"
                  className="flex min-h-[52px] items-center gap-3 border-t border-sam-border-soft px-4 py-3 md:px-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sam-icon-surface text-sam-primary">
                    {icon}
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-sam-fg">{rowTitle(row)}</span>
                </div>
              );
            })}
          </li>
        );
      })}
    </ul>
  );
}
