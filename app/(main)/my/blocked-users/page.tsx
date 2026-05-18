"use client";

import { useState } from "react";
import { BlockedUserList } from "@/components/reports/BlockedUserList";
import { MypageSubpageShell } from "@/components/mypage/i18n/MypageSubpageShell";

export default function BlockedUsersPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <MypageSubpageShell
      titleKey="route_blocked_users_title"
      subtitleKey="route_blocked_users_subtitle"
      section="account"
      bodyClassName="mx-auto max-w-4xl px-4 py-4"
    >
      <BlockedUserList
        refreshKey={refreshKey}
        onUnblock={() => setRefreshKey((k) => k + 1)}
      />
    </MypageSubpageShell>
  );
}
