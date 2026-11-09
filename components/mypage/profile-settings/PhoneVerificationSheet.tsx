"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProfileRow } from "@/lib/profile/types";
import { PhoneVerificationBox } from "@/components/mypage/profile/PhoneVerificationBox";
import { refreshClientMemberAccountAfterMutation } from "@/lib/auth/sync-member-account-client";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import {
  buildPhoneVerifySnapshot,
  fetchPhoneVerificationSettings,
  loadPhoneVerificationState,
  type PhoneVerificationSettings,
} from "@/lib/mypage/load-phone-verification-state";
import { MypageBottomSheetShell } from "./MypageBottomSheetShell";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; profile: ProfileRow; settings: PhoneVerificationSettings };

/** 전화 인증 시트 (최종 설계 S05) — 페이지와 같은 상태 규칙: 조회 실패 = 오류 + [다시 시도], 무한 로딩 금지 */
export function PhoneVerificationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { onProfileUpdated } = useMypageProfileSheets();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const genRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++genRef.current;
    setState({ kind: "loading" });
    const result = await loadPhoneVerificationState();
    if (gen !== genRef.current) return;
    setState(result.ok ? { kind: "ready", profile: result.profile, settings: result.settings } : { kind: "error" });
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    return () => {
      genRef.current += 1;
    };
  }, [open, load]);

  const snapshot = useMemo(
    () => (state.kind === "ready" ? buildPhoneVerifySnapshot(state.profile, state.settings) : null),
    [state],
  );

  /**
   * 인증 성공 직후 — 서버에서 새로 받아 앱 시작 프로필·로그인 캐시·내정보 홈을 한 번에 맞춘다(F1).
   * 시트 닫기는 완료 화면의 [확인]/1.2초 뒤(`onDone`) — 재조회 결과에 기대지 않는다(F3).
   */
  const handleRefresh = useCallback(async () => {
    const [p, settings] = await Promise.all([
      refreshClientMemberAccountAfterMutation(),
      fetchPhoneVerificationSettings(),
    ]);
    setState((prev) => {
      if (prev.kind !== "ready") return prev;
      return { kind: "ready", profile: p ?? prev.profile, settings: settings ?? prev.settings };
    });
    onProfileUpdated();
  }, [onProfileUpdated]);

  return (
    <MypageBottomSheetShell
      open={open}
      onClose={onClose}
      title={t("mypage_settings_phone")}
    >
      {state.kind === "loading" ? (
        <MyStateView kind="loading" template="form" rows={3} />
      ) : state.kind === "error" || !snapshot ? (
        <MyStateView
          kind="error"
          template="form"
          error={{ message: t("mypage_s05_load_failed"), onRetry: () => void load() }}
        />
      ) : !state.settings.enabled ? (
        <p className="py-4 text-[length:var(--overlay-body-1-size)] leading-[1.6] text-[color:var(--overlay-text-secondary)]">
          {t("mypage_comp_phone_verify_disabled")}
        </p>
      ) : (
        <PhoneVerificationBox snapshot={snapshot} onRefreshProfile={handleRefresh} onDone={onClose} surface="overlay" />
      )}
    </MypageBottomSheetShell>
  );
}
