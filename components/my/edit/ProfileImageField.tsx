"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";

export interface ProfileImageFieldProps {
  avatarUrl: string | null;
  onChangeUrl: (url: string | null) => void;
}

/**
 * 프로필 사진: Supabase Storage 업로드 (/api/me/profile/avatar) 후 public URL을 avatar_url 로 저장
 */
export function ProfileImageField({ avatarUrl, onChangeUrl }: ProfileImageFieldProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
      onChangeUrl(data.url);
    } catch {
      setUploadError(t("profile_edit_upload_failed"));
    } finally {
      setUploading((prev) => (prev ? false : prev));
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={pickFile}
        disabled={uploading}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-sam-surface-muted outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-signature disabled:opacity-60"
        aria-label={t("profile_edit_photo_aria")}
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt={t("profile_edit_photo_alt")} fill className="object-cover" sizes="80px" />
        ) : (
          <div className="flex h-full w-full items-center justify-center sam-text-hero text-sam-meta">👤</div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(ev) => void onFile(ev)}
      />
      <p className="text-center sam-text-body-secondary font-medium text-signature">
        <button type="button" onClick={pickFile} disabled={uploading} className="underline disabled:opacity-60">
          {uploading ? t("profile_edit_photo_uploading") : t("profile_edit_photo_pick")}
        </button>
        {avatarUrl ? (
          <>
            {" · "}
            <button
              type="button"
              className="text-sam-muted underline"
              onClick={() => {
                if (uploading) return;
                setUploadError((prev) => (prev === null ? prev : null));
                setUploading(true);
                void (async () => {
                  try {
                    const save = await updateMyProfile({ avatar_url: null });
                    if (!save.ok) {
                      setUploadError(save.error || t("profile_edit_save_failed"));
                      return;
                    }
                    invalidateMeProfileDedupedCache();
                    onChangeUrl(null);
                  } catch {
                    setUploadError(t("profile_edit_save_failed"));
                  } finally {
                    setUploading(false);
                  }
                })();
              }}
              disabled={uploading}
            >
              {t("profile_edit_photo_remove")}
            </button>
          </>
        ) : null}
      </p>
      {uploadError ? <p className="text-center sam-text-body-secondary text-red-600">{uploadError}</p> : null}
    </div>
  );
}
