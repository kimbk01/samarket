"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { getMyPageTabNav } from "./mypage-nav";
import { MYPAGE_TYPO } from "./mypage-typography";
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
  const tabNav = getMyPageTabNav(activeTab);
  const sectionLabel =
    tabNav.sections.find((s) => s.id === activeSection)?.label ??
    tabNav.sections[0]?.label ??
    "";

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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-gray-200 bg-[var(--background)] px-3 py-2.5 lg:hidden">
          <div className="min-w-0">
            <p className={`truncate ${MYPAGE_TYPO.meta}`}>{tabNav.label}</p>
            <p className={`truncate ${MYPAGE_TYPO.title}`}>{sectionLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-gray-800"
            aria-label="메뉴 열기"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className={MYPAGE_TYPO.navItem}>메뉴</span>
          </button>
        </div>

        <main className="min-h-0 min-w-0 flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
          {children}
        </main>
      </div>

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
    </div>
  );
}
