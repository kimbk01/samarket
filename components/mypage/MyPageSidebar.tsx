"use client";

import { useRouter } from "next/navigation";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import { buildMyPageHref, MYPAGE_NAV } from "./mypage-nav";
import { MYPAGE_TYPO } from "./mypage-typography";
import type { MyPageTabId } from "./types";
import type { ProfileRow } from "@/lib/profile/types";

export function MyPageSidebar({
  activeTab,
  activeSection,
  profile,
  mannerScore,
}: {
  activeTab: MyPageTabId;
  activeSection: string;
  profile: ProfileRow;
  mannerScore: number;
}) {
  const router = useRouter();

  const navigate = (tab: MyPageTabId, section?: string) => {
    router.replace(buildMyPageHref(tab, section), { scroll: false });
  };

  const displayName =
    profile.nickname?.trim() || profile.email?.split("@")[0] || "내정보";
  const regionLine =
    resolveProfileLocationAddressLines(profile).join(" · ") || "지역 설정 필요";

  return (
    <div className="flex flex-col bg-sam-surface">
      <div className="border-b border-sam-border px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <p className={`truncate ${MYPAGE_TYPO.title}`}>{displayName}</p>
          <p className={`mt-0.5 truncate ${MYPAGE_TYPO.meta}`}>{regionLine}</p>
          <div className="mt-1.5">
            <MannerBatteryDisplay
              raw={mannerScore}
              size="sm"
              layout="inline"
              className="gap-1.5"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push(MYPAGE_PROFILE_EDIT_HREF)}
          className={`mt-3 w-full rounded-ui-rect border border-sam-border py-2 text-center font-medium text-sam-fg hover:bg-sam-app ${MYPAGE_TYPO.navItem}`}
        >
          프로필 수정
        </button>
      </div>

      <nav className="pb-2" aria-label="내정보 메뉴">
        {MYPAGE_NAV.map((tab) => (
          <div key={tab.id}>
            <p
              className={`border-t border-sam-border-soft bg-sam-app px-3 py-2 ${MYPAGE_TYPO.meta} font-semibold uppercase tracking-wide text-sam-muted`}
            >
              {tab.label}
            </p>
            <ul className="divide-y divide-sam-border-soft">
              {tab.sections.map((section) => {
                const isActive =
                  tab.id === activeTab && section.id === activeSection;
                return (
                  <li key={`${tab.id}-${section.id}`}>
                    <button
                      type="button"
                      onClick={() => navigate(tab.id, section.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors sm:px-4 ${MYPAGE_TYPO.navItem} ${
                        isActive
                          ? "bg-blue-50 font-semibold text-blue-800"
                          : "text-sam-fg hover:bg-sam-app"
                      }`}
                    >
                      <span className="min-w-0 flex-1">{section.label}</span>
                      <ChevronIcon
                        className={isActive ? "text-blue-600" : "text-sam-meta"}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={`shrink-0 ${className ?? ""}`}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}
