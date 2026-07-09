"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { ProfileDibayIdSection } from "@/components/my/edit/ProfileDibayIdSection";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";

export function MypageRequiredDibayIdClient() {
  const router = useRouter();
  const { t } = useI18n();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
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

  const handleConfirmed = useCallback(
    async (confirmedDibayId: string) => {
      invalidateMeProfileDedupedCache();
      const fresh = await getMyProfile();
      if (fresh) {
        setProfile(fresh);
        setSupabaseProfileCache(profileRowToClientProfile(fresh));
      }
      if (confirmedDibayId.trim()) {
        router.replace(MYPAGE_MAIN_HREF);
      }
    },
    [router],
  );

  if (loading) {
    return <p className="py-10 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }
  if (!profile) {
    return (
      <p className="py-10 text-center sam-text-body text-sam-muted">
        {t("mypage_comp_profile_load_failed_short")}
      </p>
    );
  }

  return (
    <div className="px-4 py-4 sm:px-5">
      <ProfileDibayIdSection
        dibay_id={profile.dibay_id ?? null}
        dibay_id_locked={profile.dibay_id_locked === true}
        dibay_id_auto_assigned={profile.dibay_id_auto_assigned === true}
        dibay_id_changed_once={profile.dibay_id_changed_once === true}
        username={profile.username ?? profile.dibay_id ?? null}
        username_confirmed={profile.username_confirmed ?? null}
        onConfirmed={handleConfirmed}
      />
    </div>
  );
}
