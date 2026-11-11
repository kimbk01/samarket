"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { refreshClientMemberAccountAfterMutation } from "@/lib/auth/sync-member-account-client";
import type { ProfileRow } from "@/lib/profile/types";
import { ProfileDibayIdSection } from "@/components/my/edit/ProfileDibayIdSection";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { MY_STICKY_CTA_BODY_CLEARANCE_CLASS } from "@/components/mypage/ds/MyStickyCta";
import { showMypageToast } from "@/lib/mypage/mypage-toast";

/** 아이디 확정 페이지 본문 (최종 설계 S04) — 시트(`EditDibayIdSheet`)와 같은 `ProfileDibayIdSection` 공유 */
export function MypageRequiredDibayIdClient() {
  const router = useRouter();
  const { t } = useI18n();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async (isCancelled?: () => boolean) => {
    setLoading(true);
    setLoadFailed(false);
    let p: ProfileRow | null = null;
    try {
      p = await getMyProfile();
    } catch {
      p = null;
    }
    if (isCancelled?.()) return;
    setProfile(p);
    setLoadFailed(p == null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const handleConfirmed = useCallback(
    async (confirmedDibayId: string) => {
      /** 서버에서 새로 받아 앱 시작 프로필·로그인 캐시·내정보 홈을 한 번에 맞춘다 (F1 — 예전 @아이디 덮어쓰기 방지) */
      const fresh = await refreshClientMemberAccountAfterMutation().catch(() => null);
      if (fresh) setProfile(fresh);
      if (confirmedDibayId.trim()) {
        showMypageToast(t("mypage_s04_confirmed_toast"), "success");
        router.replace(MYPAGE_MAIN_HREF);
      }
    },
    [router, t],
  );

  if (loading) {
    return <MyStateView kind="loading" template="form" rows={2} />;
  }
  if (!profile || loadFailed) {
    return (
      <MyStateView
        kind="error"
        template="form"
        error={{ message: t("mypage_comp_profile_load_failed_short"), onRetry: () => void load() }}
      />
    );
  }

  return (
    <div className={`py-2 ${MY_STICKY_CTA_BODY_CLEARANCE_CLASS}`}>
      <ProfileDibayIdSection
        dibay_id={profile.dibay_id ?? null}
        dibay_id_locked={profile.dibay_id_locked === true}
        dibay_id_auto_assigned={profile.dibay_id_auto_assigned === true}
        dibay_id_changed_once={profile.dibay_id_changed_once === true}
        dibay_id_state={profile.dibay_id_state ?? null}
        dibay_id_can_change={profile.dibay_id_can_change ?? null}
        username={profile.username ?? profile.dibay_id ?? null}
        username_confirmed={profile.username_confirmed ?? null}
        ctaPlacement="sticky"
        onConfirmed={handleConfirmed}
      />
    </div>
  );
}
