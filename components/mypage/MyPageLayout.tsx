"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { MyPageSidebar } from "./MyPageSidebar";
import { MYPAGE_MOBILE_NAV_QUERY } from "./mypage-nav";
import type { MyPageTabId } from "./types";
import type { ProfileRow } from "@/lib/profile/types";
import { useIsMobileViewport } from "@/hooks/use-is-mobile-viewport";

export function MyPageLayout({
  activeTab,
  activeSection,
  profile,
  mannerScore,
  children,
}: {
  activeTab: MyPageTabId;
  activeSection: string;
  profile: ProfileRow;
  mannerScore: number;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const mobileNavList = searchParams.get(MYPAGE_MOBILE_NAV_QUERY) === "1";
  const mobile = useIsMobileViewport();
  /** SSR·데스크톱: 목록+본문 동시. 모바일: nav=1 이면 목록만, 아니면 본문만 */
  const showSidebar = !mobile || mobileNavList;
  const showMain = !mobile || !mobileNavList;

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div
        className={`shrink-0 border-b border-sam-border md:w-[220px] md:border-b-0 md:border-r lg:w-[260px] ${
          showSidebar ? "block" : "hidden"
        } md:block`}
      >
        <div className="md:sticky md:top-[76px] md:max-h-[calc(100vh-76px)] md:overflow-y-auto">
          <MyPageSidebar
            activeTab={activeTab}
            activeSection={activeSection}
            profile={profile}
            mannerScore={mannerScore}
          />
        </div>
      </div>

      <main
        className={`min-h-0 min-w-0 flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5 ${
          showMain ? "block" : "hidden"
        } md:block`}
      >
        {children}
      </main>
    </div>
  );
}
