"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { patchSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { SAMARKET_DEFAULT_AVATAR_URL } from "@/lib/profile/default-avatar";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import { hasCustomUserAvatar } from "@/lib/profile/user-avatar-display";
import { ADDR_SB_GREEN } from "@/lib/ui/profile-edit-starbucks-styles";

export interface ProfileImageFieldProps {
  avatarUrl: string | null;
  onChangeUrl: (url: string | null) => void;
  /** 히어로 — 96px 원형 */
  variant?: "default" | "hero";
}

const AVATAR_CAMERA_BADGE_CLASS =
  "pointer-events-none absolute bottom-0 right-0 z-[2] flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-white shadow-[0_1px_4px_rgba(30,57,50,0.18)]";

export function ProfileImageField({
  avatarUrl,
  onChangeUrl,
  variant = "default",
}: ProfileImageFieldProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const isHero = variant === "hero";
  const sizePx = isHero ? 96 : 80;
  const hasCustomPhoto = hasCustomUserAvatar(avatarUrl);

  const pickFile = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadError((prev) => (prev === null ? prev : null));
    setUploading((prev) => (prev ? prev : true));

    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/me/profile/avatar", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (!res.ok || !data?.ok || !data.url) {
        setUploadError(data?.error || t("profile_edit_upload_failed"));
        return;
      }

      const save = await updateMyProfile({ avatar_url: data.url });
      if (!save.ok) {
        setUploadError(save.error || t("profile_edit_save_failed"));
        return;
      }

      invalidateMeProfileDedupedCache();
      patchSupabaseProfileCache({ avatar_url: data.url });
      onChangeUrl(data.url);
    } catch {
      setUploadError(t("profile_edit_upload_failed"));
    } finally {
      setUploading((prev) => (prev ? false : prev));
    }
  };

  const removePhoto = () => {
    if (uploading) return;

    setUploadError((prev) => (prev === null ? prev : null));
    setUploading(true);

    void (async () => {
      try {
        const save = await updateMyProfile({ avatar_url: SAMARKET_DEFAULT_AVATAR_URL });
        if (!save.ok) {
          setUploadError(save.error || t("profile_edit_save_failed"));
          return;
        }

        invalidateMeProfileDedupedCache();
        patchSupabaseProfileCache({ avatar_url: SAMARKET_DEFAULT_AVATAR_URL });
        onChangeUrl(SAMARKET_DEFAULT_AVATAR_URL);
      } catch {
        setUploadError(t("profile_edit_save_failed"));
      } finally {
        setUploading(false);
      }
    })();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={pickFile}
        disabled={uploading}
        className="relative shrink-0 rounded-full disabled:opacity-60"
        style={{ width: sizePx, height: sizePx }}
        aria-label={t("profile_edit_photo_aria")}
      >
        <SamarketUserAvatar
          avatarUrl={avatarUrl}
          sizePx={sizePx}
          alt=""
          innerClassName={
            hasCustomPhoto ? "ring-2 ring-[#00704A]/20 ring-offset-2 ring-offset-[#F2F0EB]" : ""
          }
        />
        <span className={AVATAR_CAMERA_BADGE_CLASS} style={{ backgroundColor: ADDR_SB_GREEN }} aria-hidden>
          <Camera className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(ev) => void onFile(ev)}
      />

      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[13px] font-semibold">
        <button
          type="button"
          onClick={pickFile}
          disabled={uploading}
          className="text-[#00704A] disabled:opacity-60"
        >
          {uploading ? t("profile_edit_photo_uploading") : t("profile_edit_photo_pick")}
        </button>
        {hasCustomPhoto ? (
          <>
            <span className="text-[#6F4E37]/35" aria-hidden>
              ·
            </span>
            <button
              type="button"
              className="text-[#6F4E37] disabled:opacity-60"
              onClick={removePhoto}
              disabled={uploading}
            >
              {t("profile_edit_photo_remove")}
            </button>
          </>
        ) : null}
      </div>

      {uploadError ? <p className="text-center text-[12px] text-red-600">{uploadError}</p> : null}
    </div>
  );
}
