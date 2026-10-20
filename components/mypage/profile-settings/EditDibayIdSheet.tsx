"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { ProfileDibayIdSection } from "@/components/my/edit/ProfileDibayIdSection";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { MypageBottomSheetShell } from "./MypageBottomSheetShell";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";
import { getMypageHomeProjection, patchMypageHomeProjection } from "@/lib/mypage/mypage-home-store";

/** 아이디 확정 시트 (최종 설계 S04) — 페이지(`/mypage/required/dibay-id`)와 같은 `ProfileDibayIdSection` */
export function EditDibayIdSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { onProfileUpdated } = useMypageProfileSheets();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const p = await getMyProfile().catch(() => null);
      if (!cancelled) {
        setProfile(p);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, reloadKey]);

  const handleConfirmed = useCallback(
    async (confirmedDibayId: string) => {
      invalidateMeProfileDedupedCache();
      const fresh = await getMyProfile().catch(() => null);
      if (fresh) {
        setProfile(fresh);
        setSupabaseProfileCache(profileRowToClientProfile(fresh));
        const current = getMypageHomeProjection();
        patchMypageHomeProjection({
          profile: fresh,
          addressStatus: current?.addressStatus ?? "unknown",
        });
      }
      invalidateMypageSummary();
      onProfileUpdated();
      if (confirmedDibayId) {
        showMypageToast(t("mypage_s04_confirmed_toast"), "success");
        onClose();
      }
    },
    [onClose, onProfileUpdated, t],
  );

  return (
    <MypageBottomSheetShell
      open={open}
      onClose={onClose}
      title={t("mypage_settings_dibay_id")}
    >
      {loading ? (
        <MyStateView kind="loading" template="form" rows={2} />
      ) : !profile ? (
        <MyStateView
          kind="error"
          template="form"
          error={{
            message: t("mypage_comp_profile_load_failed_short"),
            onRetry: () => setReloadKey((k) => k + 1),
          }}
        />
      ) : (
        <ProfileDibayIdSection
          dibay_id={profile.dibay_id ?? null}
          dibay_id_locked={profile.dibay_id_locked === true}
          dibay_id_auto_assigned={profile.dibay_id_auto_assigned === true}
          dibay_id_changed_once={profile.dibay_id_changed_once === true}
          username={profile.username ?? profile.dibay_id ?? null}
          username_confirmed={profile.username_confirmed ?? null}
          onConfirmed={handleConfirmed}
        />
      )}
    </MypageBottomSheetShell>
  );
}
