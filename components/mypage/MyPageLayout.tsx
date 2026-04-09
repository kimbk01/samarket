"use client";

import type { ReactNode } from "react";
import { useState } from "react";
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="hidden shrink-0 border-r border-gray-200 bg-white lg:block lg:w-[260px]">
        <div className="sticky top-[76px] max-h-[calc(100vh-76px)] overflow-y-auto">
          <MyPageSidebar
            activeTab={activeTab}
            activeSection={activeSection}
            profile={profile}
            mannerScore={mannerScore}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setMobileSidebarOpen(true)}
        className="fixed bottom-6 left-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg lg:hidden"
        aria-label="내정보 메뉴"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 h-full w-[280px] overflow-y-auto bg-white shadow-xl">
            <MyPageSidebar
              activeTab={activeTab}
              activeSection={activeSection}
              profile={profile}
              mannerScore={mannerScore}
              onClose={() => setMobileSidebarOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
    </div>
  );
}
