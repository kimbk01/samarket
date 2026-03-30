"use client";

import { useState } from "react";
import { BlockedUserList } from "@/components/reports/BlockedUserList";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function BlockedUsersPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="차단 목록"
        subtitle="차단·숨김 관리"
        backHref="/mypage"
        section="account"
      />
      <div className="mx-auto max-w-4xl px-4 py-4">
        <BlockedUserList
          refreshKey={refreshKey}
          onUnblock={() => setRefreshKey((k) => k + 1)}
        />
      </div>
    </div>
  );
}
