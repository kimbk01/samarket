"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { ProfileAvatarEditor } from "@/components/my/edit/ui/ProfileAvatarEditor";
import { AutoGrowTextarea } from "@/components/write/shared/AutoGrowTextarea";
import { PROFILE_EDIT_PRIMARY_BTN_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";
import { validateOptionalNickname } from "@/lib/profile/profile-edit-form-helpers";

function applyProfileToFields(
  p: ProfileRow,
  setters: {
    setProfile: (row: ProfileRow) => void;
    setDisplayName: (v: string) => void;
    setAvatarUrl: (v: string | null) => void;
    setBio: (v: string) => void;
  },
) {
  setters.setProfile(p);
  setters.setDisplayName((p.display_name ?? p.nickname ?? "").trim());
  setters.setAvatarUrl(p.avatar_url ?? null);
  setters.setBio((p.bio ?? "").trim());
}

/** 사진·닉네임·소개 — /mypage 인라인 또는 레거시 edit 경로 */
export function ProfilePublicEditForm({
  initialProfile = null,
  onSaved,
  embedded = false,
}: {
  initialProfile?: ProfileRow | null;
  onSaved?: () => void;
  /** true: /mypage 카드 안 — 저장 후 페이지 이동 없음 */
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<ProfileRow | null>(initialProfile);
  const [loading, setLoading] = useState(!initialProfile);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(
    () => (initialProfile?.display_name ?? initialProfile?.nickname ?? "").trim(),
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile?.avatar_url ?? null);
  const [bio, setBio] = useState(() => (initialProfile?.bio ?? "").trim());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const p = await getMyProfile();
    if (p) {
      applyProfileToFields(p, { setProfile, setDisplayName, setAvatarUrl, setBio });
    } else {
      setProfile(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialProfile) {
      applyProfileToFields(initialProfile, { setProfile, setDisplayName, setAvatarUrl, setBio });
      setLoading(false);
      return;
    }
    void load();
  }, [initialProfile, load]);

  const handleSave = async () => {
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
    setSaving(true);
    const trimmedName = displayName.trim();
    const result = await updateMyProfile({
      avatar_url: withDefaultAvatar(avatarUrl),
      bio: bio.trim() || null,
      ...(trimmedName.length >= 2 ? { display_name: trimmedName } : {}),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    invalidateMeProfileDedupedCache();
    const fresh = await getMyProfile();
    if (fresh) {
      applyProfileToFields(fresh, { setProfile, setDisplayName, setAvatarUrl, setBio });
      setSupabaseProfileCache(profileRowToClientProfile(fresh));
    }
    setMessage(t("profile_edit_saved"));
    onSaved?.();
  };

  if (loading) {
    return (
      <p className="py-10 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
    );
  }
  if (!profile) {
    return (
      <p className="py-10 text-center sam-text-body text-sam-muted">
        {t("mypage_comp_profile_load_failed_short")}
      </p>
    );
  }

  return (
    <div className={`space-y-3 px-4 py-2 sm:px-5 ${embedded ? "" : "pb-6"}`}>
      <div className="flex justify-center">
        <ProfileAvatarEditor avatarUrl={avatarUrl} onChangeUrl={setAvatarUrl} />
      </div>
      <div>
        <label className="mb-1 block sam-text-helper font-medium text-sam-muted">
          {t("profile_edit_nickname_label")}
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={20}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
        />
        {error ? <p className="mt-1 text-[12px] text-red-600">{error}</p> : null}
      </div>
      <div>
        <label className="mb-1 block sam-text-helper font-medium text-sam-muted">
          {t("profile_edit_status_label")}
        </label>
        <AutoGrowTextarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={60}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
          placeholder={t("profile_edit_status_placeholder")}
        />
      </div>
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
  );
}
