"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import {
  getAdApplicationsForUser,
  CURRENT_USER_ID,
} from "@/lib/ads/mock-ad-applications";
import { MyAdApplicationList } from "@/components/ads/MyAdApplicationList";

export default function MyAdsPage() {
  const [refresh, setRefresh] = useState(0);
  const applications = useMemo(
    () => getAdApplicationsForUser(CURRENT_USER_ID),
    [refresh]
  );
  const refreshList = useCallback(() => setRefresh((r) => r + 1), []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/my" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          내 광고 신청
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="px-4 py-4">
        <div className="mb-4 flex justify-end">
          <Link
            href="/my/ads/apply"
            className="rounded-lg bg-signature px-4 py-2 text-[14px] font-medium text-white"
          >
            광고 신청
          </Link>
        </div>
        <MyAdApplicationList
          applications={applications}
          onCancel={refreshList}
        />
      </div>
    </div>
  );
}
