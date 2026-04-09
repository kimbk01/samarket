"use client";

import { useRouter } from "next/navigation";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import { buildMyPageHref, MYPAGE_NAV } from "./mypage-nav";
import type { MyPageTabId } from "./types";
import type { ProfileRow } from "@/lib/profile/types";

export function MyPageSidebar({
  activeTab,
  activeSection,
  profile,
  mannerScore,
  onClose,
}: {
  activeTab: MyPageTabId;
  activeSection: string;
  profile: ProfileRow;
  mannerScore: number;
  onClose?: () => void;
}) {
  const router = useRouter();

  const navigate = (tab: MyPageTabId, section?: string) => {
    router.replace(buildMyPageHref(tab, section), { scroll: false });
    onClose?.();
  };

  const displayName =
    profile.nickname?.trim() || profile.email?.split("@")[0] || "내정보";
  const regionLine =
    resolveProfileLocationAddressLines(profile).join(" · ") || "지역 설정 필요";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-gray-900">
              {displayName}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-gray-500">
              {regionLine}
            </p>
            <div className="mt-1.5">
              <MannerBatteryDisplay
                raw={mannerScore}
                size="sm"
                layout="inline"
                className="gap-1.5"
              />
            </div>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-600"
              aria-label="닫기"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            router.push("/mypage/edit");
            onClose?.();
          }}
          className="mt-3 w-full rounded-[4px] border border-gray-200 py-1.5 text-center text-[12px] font-medium text-gray-700 hover:bg-gray-50"
        >
          프로필 수정
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {MYPAGE_NAV.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <div key={tab.id} className="py-0.5">
              <button
                type="button"
                onClick={() => navigate(tab.id, tab.sections[0]?.id)}
                className={`flex w-full items-center rounded-[4px] px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : "text-gray-800 hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </button>
              {isActive ? (
                <div className="mt-0.5 space-y-0.5 pl-2">
                  {tab.sections.map((section) => {
                    const isSectionActive = section.id === activeSection;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => navigate(tab.id, section.id)}
                        className={`block w-full rounded-[4px] px-3 py-2 text-left text-[12px] transition-colors ${
                          isSectionActive
                            ? "bg-blue-50 font-semibold text-blue-700"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {section.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
