"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { fetchMeProfileFresh } from "@/lib/profile/fetch-me-profile-deduped";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { mergeAppBootProfileFull } from "@/lib/app-boot/app-boot-store";
import { ProfileAvatarEditor } from "@/components/my/edit/ui/ProfileAvatarEditor";
import { AutoGrowTextarea } from "@/components/write/shared/AutoGrowTextarea";
import { PROFILE_EDIT_PRIMARY_BTN_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";
import { validateOptionalNickname } from "@/lib/profile/profile-edit-form-helpers";
import { diffProfileEdit, PROFILE_CONFLICT_ERROR_CODE } from "@/lib/profile/profile-patch-concurrency";
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

export function EditPublicProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, safeT } = useI18n();
  const { onProfileUpdated } = useMypageProfileSheets();
  /** 편집 기준 원본 — 항상 DB 최신 full 조회 결과 (boot lite 스냅샷 금지: bio 누락·저장 전 값) */
  const [baseline, setBaseline] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const applyBaseline = useCallback((p: ProfileRow) => {
    setBaseline(p);
    setDisplayName((p.nickname ?? p.display_name ?? "").trim());
    setAvatarUrl(p.avatar_url ?? null);
    setBio((p.bio ?? "").trim());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
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

  /** 사진은 ProfileImageField 가 업로드·저장까지 끝낸 뒤에만 호출 — 기준 원본도 함께 갱신 */
  const handleAvatarSaved = useCallback((url: string | null) => {
    setAvatarUrl(url);
    setBaseline((prev) => (prev ? { ...prev, avatar_url: url } : prev));
  }, []);

  const handleSave = async () => {
    if (!baseline) return;
    setError(null);
    setMessage(null);
    const err = validateOptionalNickname(displayName, {
      min: t("profile_edit_err_nickname_min"),
      max: t("profile_edit_err_nickname_max"),
    });
    if (err.displayName) {
      setError(err.displayName);
      return;
    }
    /** 공개 이름 SSOT(nickname) 컬럼 기준 비교 — nickname 이 비어 있는 레거시 회원은 저장 시 채워진다 */
    const { payload, expected } = diffProfileEdit(
      { nickname: baseline.nickname ?? null, bio: baseline.bio ?? null },
      { nickname: displayName, bio }
    );
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    const result = await updateMyProfile(payload, { expected });
    if (!result.ok) {
      setSaving(false);
      setError(result.error);
      if (result.code === PROFILE_CONFLICT_ERROR_CODE) {
        /** 다른 곳에서 먼저 바뀜 — 최신 값을 다시 불러와 사용자가 확인 후 저장 */
        const latest = await fetchMeProfileFresh("mypage_profile_edit_conflict");
        if (latest) {
          applyBaseline(latest);
          applyFreshProfileEverywhere(latest);
        }
      }
      return;
    }
    /** 서버 재조회로 저장 결과 확인 — 응답 성공 메시지만으로 완료 처리하지 않는다 */
    const fresh = await fetchMeProfileFresh("mypage_profile_edit_verify");
    setSaving(false);
    if (!fresh) {
      setError(
        safeT("profile_edit_verify_failed", {
          fallbackKo: "저장 결과를 확인하지 못했습니다. 잠시 후 다시 열어 확인해 주세요.",
          fallbackEn: "Could not confirm the saved result. Please reopen and check again.",
        })
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
        })
      );
      return;
    }
    setMessage(t("profile_edit_saved"));
    onProfileUpdated();
    onClose();
  };

  return (
    <MypageBottomSheetShell
      open={open}
      onClose={onClose}
      title={safeT("mypage_settings_profile_edit")}
    >
      {loading ? (
        <p className="py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : !baseline ? (
        <div className="py-8 text-center">
          <p className="sam-text-body text-sam-muted">{t("mypage_comp_profile_load_failed_short")}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 text-[13px] font-semibold text-[#00704A] underline underline-offset-2"
          >
            {safeT("common_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex justify-center py-2">
            <ProfileAvatarEditor avatarUrl={avatarUrl} onChangeUrl={handleAvatarSaved} />
          </div>
          <div>
            <label className="mb-1.5 block sam-text-helper font-medium text-sam-muted">
              {t("profile_edit_nickname_label")}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={20}
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
            />
          </div>
          <div>
            <label className="mb-1.5 block sam-text-helper font-medium text-sam-muted">
              {t("profile_edit_status_label")}
            </label>
            <AutoGrowTextarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={60}
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body text-sam-fg"
              placeholder={t("profile_edit_status_placeholder")}
            />
          </div>
          {error ? (
            <p className="text-[13px] font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {message ? <p className="text-[13px] font-medium text-[#00704A]">{message}</p> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className={`w-full ${PROFILE_EDIT_PRIMARY_BTN_CLASS}`}
          >
            {saving ? t("profile_edit_saving") : t("common_save")}
          </button>
        </div>
      )}
    </MypageBottomSheetShell>
  );
}
