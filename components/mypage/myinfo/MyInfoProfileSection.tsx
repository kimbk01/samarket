"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ProfilePublicEditForm } from "@/components/mypage/profile/ProfilePublicEditForm";
import type { ProfileRow } from "@/lib/profile/types";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

/**
 * Legacy embedded profile editor surface.
 * Slice 3: logout MOVE off profile → Account menu (`MyInfoAccountMenuSection`).
 */
export function MyInfoProfileSection({
  profile,
  onProfileRefresh,
}: {
  profile: ProfileRow;
  onProfileRefresh?: () => void;
}) {
  const { safeT } = useI18n();

  return (
    <section id="mypage-profile" className={`${MYPAGE_HOME_CARD_CLASS} w-full self-start`}>
      <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS}`}>
        <h2 className={`min-w-0 flex-1 truncate ${MYPAGE_HOME_SECTION_LABEL_CLASS}`}>
          {safeT("mypage_hub_profile_title", {
            fallbackKo: "내 프로필",
            fallbackEn: "My profile",
          })}
        </h2>
      </div>

      <ProfilePublicEditForm
        initialProfile={profile}
        onSaved={onProfileRefresh}
        embedded
      />
    </section>
  );
}
