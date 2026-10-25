"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { fetchMeProfileFresh } from "@/lib/profile/fetch-me-profile-deduped";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { mergeAppBootProfileFull } from "@/lib/app-boot/app-boot-store";
import { ProfileAvatarEditor } from "@/components/my/edit/ui/ProfileAvatarEditor";
import { AutoGrowTextarea } from "@/components/write/shared/AutoGrowTextarea";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import {
  PROFILE_EDIT_BIO_MAX,
  PROFILE_EDIT_NICKNAME_MAX,
  resolveProfileEditSheetSaveState,
} from "@/lib/profile/profile-edit-form-helpers";
import { diffProfileEdit, PROFILE_CONFLICT_ERROR_CODE } from "@/lib/profile/profile-patch-concurrency";
import { MYPAGE_ADDRESSES_HREF } from "@/lib/mypage/mypage-profile-routes";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useRepresentativeAddressLine } from "@/hooks/use-representative-address-line";
import { MypageBottomSheetShell } from "./MypageBottomSheetShell";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";
import { getMypageHomeProjection, patchMypageHomeProjection } from "@/lib/mypage/mypage-home-store";

/** 저장 직후 서버 재조회 값 — 화면·boot 스냅샷·홈 projection 을 같은 원본으로 맞춘다 */
function applyFreshProfileEverywhere(fresh: ProfileRow): void {
  mergeAppBootProfileFull(fresh);
  setSupabaseProfileCache(profileRowToClientProfile(fresh));
  const current = getMypageHomeProjection();
  patchMypageHomeProjection({
    profile: fresh,
    addressStatus: current?.addressStatus ?? "unknown",
  });
}

const INPUT_CLASS = `${Sam.input.base} ${Sam.focusRing} rounded-ui-rect text-[16px]`;

/**
 * [저장] 비활성 — 불투명도 대신 회색 토큰 배경·글자 (real-screen-redesign §3·§6).
 * 저장 중(스피너)은 그린 유지 — 저장 중에는 비활성 회색을 쓰지 않는다.
 */
const SAVE_DISABLED_CLASS =
  "disabled:opacity-100 disabled:border-sam-border disabled:bg-sam-surface-muted disabled:text-sam-muted";

/** 열 때 프로필 full 조회 동안 — 원 96 + 입력 2줄 + 버튼 바 (구조 일치 스켈레톤, S01) */
function EditPublicProfileSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <div className="space-y-5" aria-busy="true" data-testid="profile-edit-sheet-skeleton">
      <div className="flex justify-center py-2">
        <span className="block h-24 w-24 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2">
          <span className={`block h-3 w-16 ${bone}`} />
          <span className={`block h-[46px] w-full ${bone}`} />
        </div>
      ))}
      <span className={`block h-[46px] w-full ${bone}`} />
    </div>
  );
}

/**
 * 프로필 수정 단일 표면 = 바텀시트 (최종 설계 X1 · S01).
 * 사진(선택 즉시 저장) → 닉네임(2~20자 실시간 검증) → 상태(n/60) → 동네(읽기 전용 + 주소 관리 링크) → 하단 고정 [저장].
 * [저장] 은 변경이 있고 검증을 통과할 때만 활성. 변경 있는 상태로 닫으면 미저장 확인.
 */
export function EditPublicProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, safeT } = useI18n();
  const { onProfileUpdated } = useMypageProfileSheets();
  const neighborhood = useRepresentativeAddressLine();
  /** 편집 기준 원본 — 항상 DB 최신 full 조회 결과 (boot lite 스냅샷 금지: bio 누락·저장 전 값) */
  const [baseline, setBaseline] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const { run, pending: saving } = useMypageSubmitGuard();

  const applyBaseline = useCallback((p: ProfileRow) => {
    setBaseline(p);
    setDisplayName((p.nickname ?? p.display_name ?? "").trim());
    setAvatarUrl(p.avatar_url ?? null);
    setBio((p.bio ?? "").trim());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    const p = await fetchMeProfileFresh("mypage_profile_edit_open");
    if (p) {
      applyBaseline(p);
      applyFreshProfileEverywhere(p);
    } else {
      setBaseline(null);
    }
    setLoading(false);
  }, [applyBaseline]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const saveState = useMemo(
    () =>
      resolveProfileEditSheetSaveState({
        baseline: baseline ? { nickname: baseline.nickname ?? baseline.display_name ?? null, bio: baseline.bio ?? null } : null,
        nickname: displayName,
        bio,
      }),
    [baseline, bio, displayName],
  );

  /** 닫기(X·바깥 탭·끌어 닫기·Android 뒤로) — 변경 있으면 미저장 확인 */
  const requestClose = useCallback(() => {
    if (saving) return;
    if (saveState.dirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  }, [onClose, saveState.dirty, saving]);

  /** 사진은 ProfileImageField 가 업로드·저장까지 끝낸 뒤에만 호출 — 기준 원본도 함께 갱신 */
  const handleAvatarSaved = useCallback((url: string | null) => {
    setAvatarUrl(url);
    setBaseline((prev) => (prev ? { ...prev, avatar_url: url } : prev));
    invalidateMypageSummary();
  }, []);

  const handleSave = () =>
    run(async () => {
      if (!baseline || !saveState.canSave) return;
      setError(null);
      setNotice(null);
      /** 공개 이름 SSOT(nickname) 컬럼 기준 비교 — nickname 이 비어 있는 레거시 회원은 저장 시 채워진다 */
      const { payload, expected } = diffProfileEdit(
        { nickname: baseline.nickname ?? null, bio: baseline.bio ?? null },
        { nickname: displayName, bio },
      );
      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
      const result = await updateMyProfile(payload, { expected });
      if (!result.ok) {
        if (result.code === PROFILE_CONFLICT_ERROR_CODE) {
          /** 다른 곳에서 먼저 바뀜 — 최신 값을 다시 채우고 안내, 사용자가 확인 후 다시 저장 */
          const latest = await fetchMeProfileFresh("mypage_profile_edit_conflict");
          if (latest) {
            applyBaseline(latest);
            applyFreshProfileEverywhere(latest);
          }
          setNotice(t("mypage_s01_conflict_reloaded"));
          return;
        }
        setError(result.error || t("profile_edit_save_failed"));
        showMypageToast(t("profile_edit_save_failed"), "error");
        return;
      }
      /** 서버 재조회로 저장 결과 확인 — 응답 성공 메시지만으로 완료 처리하지 않는다 */
      const fresh = await fetchMeProfileFresh("mypage_profile_edit_verify");
      if (!fresh) {
        setError(
          safeT("profile_edit_verify_failed", {
            fallbackKo: "저장 결과를 확인하지 못했습니다. 잠시 후 다시 열어 확인해 주세요.",
            fallbackEn: "Could not confirm the saved result. Please reopen and check again.",
          }),
        );
        return;
      }
      const nicknameOk = payload.nickname === undefined || (fresh.nickname ?? "") === payload.nickname;
      const bioOk = payload.bio === undefined || (fresh.bio ?? null) === payload.bio;
      applyBaseline(fresh);
      applyFreshProfileEverywhere(fresh);
      if (!nicknameOk || !bioOk) {
        setError(
          safeT("profile_edit_verify_mismatch", {
            fallbackKo: "저장된 내용이 입력과 다릅니다. 다시 확인해 주세요.",
            fallbackEn: "The saved value differs from your input. Please check again.",
          }),
        );
        return;
      }
      invalidateMypageSummary();
      showMypageToast(t("mypage_s01_saved_toast"), "success");
      onProfileUpdated();
      onClose();
    });

  const nicknameMessage =
    saveState.nicknameIssue === "required"
      ? t("mypage_s01_nickname_required")
      : saveState.nicknameIssue === "min"
        ? t("profile_edit_err_nickname_min")
        : saveState.nicknameIssue === "max"
          ? t("profile_edit_err_nickname_max")
          : null;
  /** 첫 진입 값(빈 닉네임 레거시 회원)에는 오류를 바로 칠하지 않고, 사용자가 바꾼 뒤에만 표시 */
  const showNicknameError = Boolean(nicknameMessage) && saveState.dirty;
  const bioLength = bio.length;

  const footer =
    !loading && baseline ? (
      <div className="border-t border-sam-border-soft px-1 pt-2.5" data-testid="profile-edit-sheet-footer">
        <button
          type="button"
          data-testid="profile-edit-sheet-save"
          disabled={!saveState.canSave || saving}
          aria-busy={saving}
          onClick={() => void handleSave()}
          className={`${Sam.btn.primaryCombo} ${Sam.btn.block} ${Sam.focusRing} relative ${saving ? "disabled:opacity-100" : SAVE_DISABLED_CLASS}`}
        >
          <span className={saving ? "invisible" : undefined}>{t("common_save")}</span>
          {saving ? (
            <span className="absolute inset-0 flex items-center justify-center" role="status">
              <span className="sr-only">{t("profile_edit_saving")}</span>
              <span
                aria-hidden
                className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
              />
            </span>
          ) : null}
        </button>
      </div>
    ) : null;

  return (
    <>
      <MypageBottomSheetShell
        open={open}
        onClose={requestClose}
        title={safeT("mypage_settings_profile_edit")}
        footer={footer}
      >
        {loading ? (
          <EditPublicProfileSkeleton />
        ) : !baseline ? (
          <MyStateView
            kind="error"
            template="form"
            error={{ message: t("mypage_comp_profile_load_failed_short"), onRetry: () => void load() }}
          />
        ) : (
          <div className="space-y-5">
            <div className="flex justify-center py-2">
              <ProfileAvatarEditor avatarUrl={avatarUrl} onChangeUrl={handleAvatarSaved} />
            </div>
            <div>
              <label
                htmlFor="mypage-profile-edit-nickname"
                className="mb-1.5 block sam-text-helper font-medium text-sam-muted"
              >
                {t("profile_edit_nickname_label")}
              </label>
              <input
                id="mypage-profile-edit-nickname"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={PROFILE_EDIT_NICKNAME_MAX}
                aria-invalid={showNicknameError}
                aria-describedby="mypage-profile-edit-nickname-hint"
                className={`${INPUT_CLASS} ${showNicknameError ? Sam.input.error : ""}`}
              />
              <p
                id="mypage-profile-edit-nickname-hint"
                className={`mt-1 text-[12px] ${showNicknameError ? "text-sam-danger" : "text-sam-muted"}`}
                role={showNicknameError ? "alert" : undefined}
                data-testid="profile-edit-nickname-hint"
              >
                {showNicknameError ? nicknameMessage : t("mypage_s01_nickname_rule")}
              </p>
            </div>
            <div>
              <label
                htmlFor="mypage-profile-edit-bio"
                className="mb-1.5 block sam-text-helper font-medium text-sam-muted"
              >
                {t("profile_edit_status_label")}
              </label>
              <AutoGrowTextarea
                id="mypage-profile-edit-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={PROFILE_EDIT_BIO_MAX}
                className={`${INPUT_CLASS} ${saveState.bioTooLong ? Sam.input.error : ""}`}
                placeholder={t("profile_edit_status_placeholder")}
              />
              <p
                className="mt-1 text-right text-[12px] tabular-nums text-sam-muted"
                data-testid="profile-edit-bio-counter"
              >
                {bioLength}/{PROFILE_EDIT_BIO_MAX}
              </p>
            </div>
            <div>
              <p className="mb-1.5 sam-text-helper font-medium text-sam-muted">{t("mypage_s01_neighborhood_label")}</p>
              <div className="flex min-h-[46px] items-center justify-between gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-app px-3">
                <span className="min-w-0 flex-1 truncate sam-text-body text-sam-fg">
                  {neighborhood.status === "loading" ? (
                    <span className="block h-3.5 w-32 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
                  ) : (
                    neighborhood.line?.trim() || t("mypage_hub_neighborhood_unset")
                  )}
                </span>
                <Link
                  href={MYPAGE_ADDRESSES_HREF}
                  onClick={(e) => {
                    if (saveState.dirty) {
                      e.preventDefault();
                      setDiscardConfirmOpen(true);
                      return;
                    }
                    onClose();
                  }}
                  className={`shrink-0 text-[13px] font-semibold text-sam-primary ${Sam.focusRing}`}
                >
                  {t("mypage_s01_neighborhood_change")}
                </Link>
              </div>
            </div>
            {notice ? (
              <p className="text-[13px] font-medium text-sam-primary" role="status" data-testid="profile-edit-conflict-notice">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p className="text-[13px] font-medium text-sam-danger" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </MypageBottomSheetShell>
      <MobileConfirmBottomSheet
        open={discardConfirmOpen}
        title={t("mypage_s01_discard_title")}
        cancelLabel={t("mypage_s01_discard_keep")}
        confirmLabel={t("mypage_s01_discard_confirm")}
        confirmTone="danger"
        onCancel={() => setDiscardConfirmOpen(false)}
        onConfirm={() => {
          setDiscardConfirmOpen(false);
          onClose();
        }}
      />
    </>
  );
}
