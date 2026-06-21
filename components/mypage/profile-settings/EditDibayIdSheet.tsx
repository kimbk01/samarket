"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { ProfileDibayIdSection } from "@/components/my/edit/ProfileDibayIdSection";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { MypageBottomSheetShell } from "./MypageBottomSheetShell";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";

export function EditDibayIdSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { onProfileUpdated } = useMypageProfileSheets();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const handleConfirmed = useCallback(
    async (confirmedDibayId: string) => {
      invalidateMeProfileDedupedCache();
      const fresh = await getMyProfile();
      if (fresh) {
        setProfile(fresh);
        setSupabaseProfileCache(profileRowToClientProfile(fresh));
      }
      onProfileUpdated();
      if (confirmedDibayId) onClose();
    },
    [onClose, onProfileUpdated],
  );

  return (
    <MypageBottomSheetShell
      open={open}
      onClose={onClose}
      title={t("mypage_settings_dibay_id")}
    >
      {loading ? (
        <p className="py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : !profile ? (
        <p className="py-8 text-center sam-text-body text-sam-muted">{t("mypage_comp_profile_load_failed_short")}</p>
      ) : (
        <ProfileDibayIdSection
          dibayId={profile.dibay_id ?? null}
          dibayIdLocked={profile.dibay_id_locked === true}
          username={profile.username ?? profile.dibay_id ?? null}
          usernameConfirmed={profile.username_confirmed ?? null}
          onConfirmed={handleConfirmed}
        />
      )}
    </MypageBottomSheetShell>
  );
}
