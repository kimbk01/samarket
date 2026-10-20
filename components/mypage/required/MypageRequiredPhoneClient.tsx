"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProfileRow } from "@/lib/profile/types";
import { PhoneVerificationBox } from "@/components/mypage/profile/PhoneVerificationBox";
import { refreshClientMemberAccountAfterMutation } from "@/lib/auth/sync-member-account-client";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { MY_STICKY_CTA_BODY_CLEARANCE_CLASS } from "@/components/mypage/ds/MyStickyCta";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import {
  buildPhoneVerifySnapshot,
  loadPhoneVerificationState,
  type PhoneVerificationSettings,
} from "@/lib/mypage/load-phone-verification-state";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; profile: ProfileRow; settings: PhoneVerificationSettings };

/**
 * 전화 인증 페이지 (최종 설계 S05).
 * 프로필·설정 중 하나라도 실패하면 오류 + [다시 시도] — 무한 로딩 금지(이전 로딩·스냅샷 null 고착 수정).
 */
export function MypageRequiredPhoneClient() {
  const router = useRouter();
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const genRef = useRef(0);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const gen = ++genRef.current;
    if (!opts?.silent) setState({ kind: "loading" });
    const result = await loadPhoneVerificationState();
    if (gen !== genRef.current) return;
    if (!result.ok) {
      setState((prev) => (opts?.silent && prev.kind === "ready" ? prev : { kind: "error" }));
      return;
    }
    setState({ kind: "ready", profile: result.profile, settings: result.settings });
  }, []);

  useEffect(() => {
    void load();
    return () => {
      genRef.current += 1;
    };
  }, [load]);

  const snapshot = useMemo(
    () => (state.kind === "ready" ? buildPhoneVerifySnapshot(state.profile, state.settings) : null),
    [state],
  );

  const handleRefresh = useCallback(async () => {
    const fresh = await refreshClientMemberAccountAfterMutation();
    invalidateMypageSummary();
    await load({ silent: true });
    if (fresh && hasVerifiedPhone(fresh)) {
      const raw =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("returnTo")
          : null;
      router.replace(sanitizeNextPath(raw) || MYPAGE_MAIN_HREF);
    }
  }, [load, router]);

  if (state.kind === "loading") {
    return <MyStateView kind="loading" template="form" rows={3} />;
  }
  if (state.kind === "error" || !snapshot) {
    return (
      <MyStateView
        kind="error"
        template="form"
        error={{ message: t("mypage_s05_load_failed"), onRetry: () => void load() }}
      />
    );
  }

  if (!state.settings.enabled) {
    return (
      <p className="py-6 sam-text-body text-sam-muted" data-testid="phone-verify-disabled">
        {t("mypage_comp_phone_verify_disabled")}
      </p>
    );
  }

  return (
    <div className={`py-2 ${MY_STICKY_CTA_BODY_CLEARANCE_CLASS}`}>
      <PhoneVerificationBox snapshot={snapshot} onRefreshProfile={handleRefresh} verifyCtaPlacement="sticky" />
    </div>
  );
}
