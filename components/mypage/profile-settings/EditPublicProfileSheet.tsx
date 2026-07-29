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
import { MypageBottomSheetShell } from "./MypageBottomSheetShell";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";
import { getMypageHomeProjection, patchMypageHomeProjection } from "@/lib/mypage/mypage-home-store";

export function EditPublicProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, safeT } = useI18n();
  const { onProfileUpdated } = useMypageProfileSheets();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const p = await getMyProfile();
    setProfile(p);
    if (p) {
      setDisplayName((p.display_name ?? p.nickname ?? "").trim());
      setAvatarUrl(p.avatar_url ?? null);
      setBio((p.bio ?? "").trim());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

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
      setSupabaseProfileCache(profileRowToClientProfile(fresh));
      const current = getMypageHomeProjection();
      patchMypageHomeProjection({
        profile: fresh,
        addressStatus: current?.addressStatus ?? "unknown",
      });
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
      ) : !profile ? (
        <p className="py-8 text-center sam-text-body text-sam-muted">{t("mypage_comp_profile_load_failed_short")}</p>
      ) : (
        <div className="space-y-5">
          <div className="flex justify-center py-2">
            <ProfileAvatarEditor avatarUrl={avatarUrl} onChangeUrl={setAvatarUrl} />
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
            {error ? <p className="mt-1 text-[12px] text-red-600">{error}</p> : null}
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
