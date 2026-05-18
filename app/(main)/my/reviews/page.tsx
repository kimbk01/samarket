"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyReviewsView } from "@/components/reviews/MyReviewsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MyReviewsPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("route_reviews_received_title")}
        subtitle={t("route_reviews_received_subtitle")}
        backHref="/mypage"
        section="trade"
      />
      <div className="pt-4">
        <MyReviewsView />
      </div>
    </div>
  );
}
