"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GuestLoginRequiredPanel } from "@/components/auth/GuestLoginRequiredPanel";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";

export function MypageCommunityPostsGuestPanel() {
  return (
    <GuestLoginRequiredPanel
      actionType="community_write"
      next="/mypage/community-posts"
      messageKey="route_community_posts_login_prompt"
    />
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
