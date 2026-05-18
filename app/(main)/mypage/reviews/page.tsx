"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyWrittenReviewsView } from "@/components/mypage/reviews/MyWrittenReviewsView";
import { MypageSubpageShell } from "@/components/mypage/i18n/MypageSubpageShell";

export default function MypageReviewsHubPage() {
  const { t } = useI18n();
  return (
    <MypageSubpageShell titleKey="route_reviews_manage_title" subtitleKey="route_reviews_manage_subtitle">
      <div className="flex min-w-0 flex-col gap-4 py-4">
        <p className="sam-text-body leading-relaxed text-sam-muted">
          <strong className="text-sam-fg">{t("reviews_hint_written")}</strong>
          {t("reviews_hint_body_before")}{" "}
          <Link href="/mypage/purchases" className="font-medium text-signature underline">
            {t("reviews_nav_purchases")}
          </Link>{" "}
          {t("reviews_hint_body_mid")}{" "}
          <strong className="text-sam-fg">{t("reviews_hint_trade_complete")}</strong>{" "}
          {t("reviews_hint_body_after")}
        </p>
        <MyWrittenReviewsView />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
          <p className="mb-2 sam-text-body-secondary font-medium text-sam-fg">{t("route_shortcuts")}</p>
          <ul className="space-y-2">
            <li>
              <Link
                href="/mypage/purchases"
                className="block rounded-ui-rect border border-sam-border bg-sam-primary-soft px-3 py-2.5 sam-text-body font-medium text-foreground"
              >
                {t("reviews_nav_purchases")}
              </Link>
            </li>
            <li>
              <Link
                href="/mypage/sales"
                className="block rounded-ui-rect border border-sam-border bg-sam-primary-soft px-3 py-2.5 sam-text-body font-medium text-foreground"
              >
                {t("reviews_nav_sales")}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </MypageSubpageShell>
  );
}
