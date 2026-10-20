"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayActionSheet } from "@/components/ui/dibay-overlay/DibayActionSheet";
import { ensureCameraWithDiBaYGate } from "@/lib/permissions/device-permission-manager";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { patchSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { SAMARKET_DEFAULT_AVATAR_URL } from "@/lib/profile/default-avatar";
import { fetchMeProfileFresh, invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import { PROFILE_CONFLICT_ERROR_CODE } from "@/lib/profile/profile-patch-concurrency";
import { hasCustomUserAvatar } from "@/lib/profile/user-avatar-display";

export interface ProfileImageFieldProps {
  avatarUrl: string | null;
  onChangeUrl: (url: string | null) => void;
  /** 히어로 — 96px 원형 */
  variant?: "default" | "hero";
}

const AVATAR_CAMERA_BADGE_CLASS =
  "pointer-events-none absolute bottom-0 right-0 z-[2] flex h-7 w-7 items-center justify-center rounded-full border-2 border-sam-surface bg-sam-primary text-[var(--sam-icon-on-primary)] shadow-[var(--sam-shadow-elevated)]";

export function ProfileImageField({
  avatarUrl,
  onChangeUrl,
  variant = "default",
}: ProfileImageFieldProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const isHero = variant === "hero";
  const sizePx = isHero ? 96 : 80;
  const hasCustomPhoto = hasCustomUserAvatar(avatarUrl);

  const pickFile = () => inputRef.current?.click();

  /**
   * 사진 촬영 — `<input capture="user">`. 네이티브 앱은 기존 기기 권한 게이트(카메라)를 먼저 통과한다.
   * 웹은 브라우저가 권한을 직접 묻는다.
   */
  const takePhoto = async () => {
    if (isCapacitorNativePlatform()) {
      const gate = await ensureCameraWithDiBaYGate();
      if (!gate.ok && gate.reason === "denied") {
        setUploadError(t("mypage_s01_photo_camera_denied"));
        return;
      }
    }
    cameraInputRef.current?.click();
  };

  /** 사진 탭 → 액션시트 [앨범에서 선택] · [사진 촬영] · [기본 사진으로](사용자 사진일 때만) · [취소] (S01) */
  const openPhotoActions = () => {
    if (uploading) return;
    setActionSheetOpen(true);
  };

  /** 409 profile_conflict — 다른 곳에서 바뀐 최신 사진으로 맞춰 같은 기대값으로 409 가 반복되지 않게 한다 */
  const syncLatestAvatarOnConflict = async (save: { ok: false; code?: string }) => {
    if (save.code !== PROFILE_CONFLICT_ERROR_CODE) return;
    const latest = await fetchMeProfileFresh("profile_avatar_conflict");
    if (latest) onChangeUrl(latest.avatar_url ?? null);
  };

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

      /**
       * 새 파일 업로드 성공 후 DB 반영. 기대값(현재 표시 사진)이 DB 와 다르면 409 — 다른 기기에서 바뀐 사진을 덮지 않는다.
       * 실패 시 onChangeUrl 을 부르지 않으므로 기존 사진·DB 값이 그대로 유지된다(이전 파일은 서버가 DB 반영 후에만 정리).
       */
      const save = await updateMyProfile({ avatar_url: data.url }, { expected: { avatar_url: avatarUrl } });
      if (!save.ok) {
        setUploadError(save.error || t("profile_edit_save_failed"));
        await syncLatestAvatarOnConflict(save);
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
        const save = await updateMyProfile(
          { avatar_url: SAMARKET_DEFAULT_AVATAR_URL },
          { expected: { avatar_url: avatarUrl } }
        );
        if (!save.ok) {
          setUploadError(save.error || t("profile_edit_save_failed"));
          await syncLatestAvatarOnConflict(save);
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
        onClick={openPhotoActions}
        disabled={uploading}
        data-testid="profile-photo-trigger"
        className="relative shrink-0 rounded-full disabled:opacity-60"
        style={{ width: sizePx, height: sizePx }}
        aria-label={t("profile_edit_photo_aria")}
      >
        <SamarketUserAvatar
          avatarUrl={avatarUrl}
          sizePx={sizePx}
          alt=""
          innerClassName={
            hasCustomPhoto ? "ring-2 ring-sam-primary/20 ring-offset-2 ring-offset-sam-app" : ""
          }
        />
        <span className={AVATAR_CAMERA_BADGE_CLASS} aria-hidden>
          <Camera className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        data-testid="profile-photo-input-album"
        onChange={(ev) => void onFile(ev)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        className="hidden"
        data-testid="profile-photo-input-camera"
        onChange={(ev) => void onFile(ev)}
      />

      <button
        type="button"
        onClick={openPhotoActions}
        disabled={uploading}
        className="min-h-[44px] px-2 text-[13px] font-semibold text-sam-primary disabled:opacity-60"
      >
        {uploading ? t("profile_edit_photo_uploading") : t("profile_edit_photo_pick")}
      </button>

      <DibayActionSheet
        open={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        title={t("profile_edit_photo_aria")}
        cancelLabel={t("common_cancel")}
        items={[
          { key: "album", label: t("mypage_s01_photo_album"), onClick: pickFile },
          { key: "camera", label: t("mypage_s01_photo_camera"), onClick: () => void takePhoto() },
          ...(hasCustomPhoto
            ? [{ key: "default", label: t("mypage_s01_photo_default"), onClick: removePhoto }]
            : []),
        ]}
      />

      {uploadError ? <p className="text-center text-[12px] text-sam-danger">{uploadError}</p> : null}
    </div>
  );
}
