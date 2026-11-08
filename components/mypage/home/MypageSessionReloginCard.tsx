"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runAuthSessionExpiredExit } from "@/lib/auth/auth-exit-coordinator";
import { MYPAGE_HOME_CARD_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";

/**
 * Profile API failed while local session still looks logged-in.
 * Replaces endless 「확인 중」 with an explicit re-login path (clears corrupt cookies).
 */
export function MypageSessionReloginCard() {
  const { safeT } = useI18n();
  const [busy, setBusy] = useState(false);

  const onRelogin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await runAuthSessionExpiredExit();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`${MYPAGE_HOME_CARD_CLASS} border border-sam-danger/35 bg-sam-danger-soft px-4 py-4`}
      data-mypage-session-relogin="1"
      role="alert"
    >
      <p className="text-[15px] font-semibold text-sam-danger">
        {safeT("mypage_comp_profile_load_failed_short")}
      </p>
      <p className="mt-1.5 text-[13px] leading-5 text-sam-muted">
        {safeT("auth_session_expired_notice")}
      </p>
      <button
        type="button"
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-ui-rect bg-sam-primary px-4 text-[14px] font-semibold text-white disabled:opacity-60"
        disabled={busy}
        onClick={() => void onRelogin()}
      >
        {busy
          ? safeT("common_loading")
          : safeT("mypage_comp_session_relogin_cta")}
      </button>
    </div>
  );
}
