"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointPromotionOrderList } from "@/components/points/PointPromotionOrderList";
import type { PointPromotionOrder } from "@/lib/types/point";

export default function MyPointsPromotionsPage() {
  const { t } = useI18n();
  const balance = 0;
  const orders: PointPromotionOrder[] = [];

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_points_promotions_title")}
        subtitle={t("mypage_points_promotions_subtitle")}
        backHref="/mypage/points"
        section="account"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg space-y-6 p-4">
        <div className="rounded-ui-rect border border-amber-100 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-900">
          {t("mypage_points_promotions_notice")}
        </div>
        <PointBalanceCard balance={balance} />
        <div>
          <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">
            내 노출 신청 내역
          </h2>
          <PointPromotionOrderList orders={orders} />
        </div>
      </div>
    </div>
  );
}
