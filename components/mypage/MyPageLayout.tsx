"use client";

import type { ReactNode } from "react";
import { MyPageSidebar } from "./MyPageSidebar";
import type { MyPageTabId } from "./types";
import type { ProfileRow } from "@/lib/profile/types";

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
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="shrink-0 border-b border-gray-200 md:w-[220px] md:border-b-0 md:border-r lg:w-[260px]">
        <div className="md:sticky md:top-[76px] md:max-h-[calc(100vh-76px)] md:overflow-y-auto">
          <MyPageSidebar
            activeTab={activeTab}
            activeSection={activeSection}
            profile={profile}
            mannerScore={mannerScore}
          />
        </div>
      </div>

      <main className="min-h-0 min-w-0 flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
        {children}
      </main>
    </div>
  );
}
