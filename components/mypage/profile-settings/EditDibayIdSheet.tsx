"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { refreshClientMemberAccountAfterMutation } from "@/lib/auth/sync-member-account-client";
import type { ProfileRow } from "@/lib/profile/types";
import { ProfileDibayIdSection } from "@/components/my/edit/ProfileDibayIdSection";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { MypageBottomSheetShell } from "./MypageBottomSheetShell";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";

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
      /** 서버에서 새로 받아 앱 시작 프로필·로그인 캐시·내정보 홈을 한 번에 맞춘다 (F1 — 예전 @아이디 덮어쓰기 방지) */
      const fresh = await refreshClientMemberAccountAfterMutation().catch(() => null);
      if (fresh) setProfile(fresh);
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
          surface="overlay"
          onConfirmed={handleConfirmed}
        />
      )}
    </MypageBottomSheetShell>
  );
}
