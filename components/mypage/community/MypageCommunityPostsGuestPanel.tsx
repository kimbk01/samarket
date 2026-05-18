"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";

export function MypageCommunityPostsGuestPanel() {
  const { t } = useI18n();
  return (
    <div className={`${PHILIFE_FB_CARD_CLASS} sam-card-pad py-8 text-center sam-text-body text-sam-muted`}>
      {t("route_community_posts_login_prompt")}
      <div className="mt-4">
        <Link href="/login" className="font-medium text-sam-primary hover:underline">
          {t("common_login")}
        </Link>
      </div>
    </div>
  );
}

export function MypageCommunityPostsEmpty() {
  const { t } = useI18n();
  return (
    <p className={`${PHILIFE_FB_CARD_CLASS} sam-card-pad py-12 text-center sam-text-body text-sam-muted`}>
      {t("route_community_posts_empty")}
    </p>
  );
}
