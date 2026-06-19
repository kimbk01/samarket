"use client";

import { GuestLoginRequiredPanel } from "@/components/auth/GuestLoginRequiredPanel";

export function MypageCommunityActivityGuestPanel() {
  return (
    <GuestLoginRequiredPanel
      actionType="community_write"
      next="/mypage/community-activity"
      messageKey="route_community_activity_login_prompt"
    />
  );
}
