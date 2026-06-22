"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MypageSelfProfileView } from "@/components/mypage/profile/MypageSelfProfileView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { useEffect, useState } from "react";
import type { ProfileRow } from "@/lib/profile/types";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageProfilePage() {
  const { t, safeT } = useI18n();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await getMyProfile();
      if (!cancelled) {
        setProfile(p);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={safeT("mypage_hub_profile_title", {
          fallbackKo: "내 프로필",
          fallbackEn: "My profile",
        })}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        {loading ? (
          <p className="py-10 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : profile ? (
          <MypageSelfProfileView profile={profile} />
        ) : (
          <p className="py-10 text-center sam-text-body text-sam-muted">
            {t("mypage_comp_profile_load_failed_short")}
          </p>
        )}
      </div>
    </div>
  );
}
