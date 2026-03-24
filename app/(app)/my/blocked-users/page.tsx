"use client";

import { useState } from "react";
import { BlockedUserList } from "@/components/reports/BlockedUserList";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function BlockedUsersPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          차단 목록
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="px-4 py-4">
        <BlockedUserList
          refreshKey={refreshKey}
          onUnblock={() => setRefreshKey((k) => k + 1)}
        />
      </div>
    </div>
  );
}
