"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRouter } from "next/navigation";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import { formatAtUsername, resolveDisplayName } from "@/lib/users/user-label";
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
  const { t, safeT } = useI18n();

  const navigate = (tab: MyPageTabId, section?: string) => {
    router.replace(buildMyPageHref(tab, section), { scroll: false });
  };

  const displayName = resolveDisplayName(profile) || t("mypage_comp_sidebar_display_fallback");
  const atUsername = formatAtUsername(profile.username ?? null);
  const regionLine =
    resolveProfileLocationAddressLines(profile).join(" · ") || t("mypage_comp_sidebar_region_placeholder");

  return (
    <div className="flex flex-col bg-sam-surface">
      <div className="border-b border-sam-border px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <p className={`truncate ${MYPAGE_TYPO.title}`}>{displayName}</p>
          {atUsername ? <p className={`mt-0.5 truncate font-mono ${MYPAGE_TYPO.meta}`}>{atUsername}</p> : null}
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
          {t("mypage_comp_profile_edit")}
        </button>
      </div>

      <nav className="pb-2" aria-label={t("mypage_comp_sidebar_nav_aria")}>
        {MYPAGE_NAV.map((tab) => (
          <div key={tab.id}>
            <p
              className={`border-t border-sam-border-soft bg-sam-app px-3 py-2 ${MYPAGE_TYPO.meta} font-semibold uppercase tracking-wide text-sam-muted`}
            >
              <span className="block truncate">{safeT(tab.labelKey)}</span>
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
                          ? "bg-sam-primary-soft font-semibold text-sam-primary"
                          : "text-sam-fg hover:bg-sam-app"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-[12px] leading-[1.25]">
                        {safeT(section.labelKey)}
                      </span>
                      <ChevronIcon
                        className={isActive ? "text-sam-primary" : "text-sam-meta"}
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
