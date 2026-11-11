"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegisterMainTier1Header } from "@/lib/layout/use-register-main-tier1-header";
import { moimApi, moimErrorKey, moimRoutes } from "@/lib/moim/moim-client-api";
import { useMoimDetail } from "@/components/moim/MoimDetailScreen";
import { useMoimImageUpload } from "@/components/moim/use-moim-image-upload";
import { MoimAvatar, MoimEmptyState, MoimErrorState, MoimListSkeleton, moimCls, useMoimToast } from "@/components/moim/moim-ui";

/** 내 모임 프로필 (시안 U10 위쪽) — 이 모임에서만 쓰는 닉네임·사진·소개 */
export function MoimProfileScreen({ moimId }: { moimId: string }) {
  const { t } = useI18n();
  const toast = useMoimToast();
  const { uploading, upload } = useMoimImageUpload();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { moim, error, reload } = useMoimDetail(moimId);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const header = useMemo(() => ({ titleText: t("moim_profile_title"), backHref: moimRoutes.home(moimId) }), [moimId, t]);
  useRegisterMainTier1Header(header);

  useEffect(() => {
    if (!moim) return;
    setNickname(moim.viewer.nickname ?? "");
    setBio(moim.viewer.bio ?? "");
    setAvatar(moim.viewer.avatarUrl);
  }, [moim]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const r = await upload([f]);
    if (r.urls[0]) setAvatar(r.urls[0]);
    if (r.failed) toast.show(t("moim_screen_upload_failed"), "error");
  };

  const save = async () => {
    if (!nickname.trim() || busy) return;
    setBusy(true);
    setSaveError(null);
    const r = await moimApi.updateProfile(moimId, { nickname: nickname.trim(), avatarUrl: avatar, bio: bio.trim() });
    setBusy(false);
    if (!r.ok) return setSaveError(t(moimErrorKey(r.error)));
    toast.show(t("moim_profile_saved_toast"), "success");
    reload();
  };

  if (error) {
    return (
      <div className={moimCls.page}>
        <MoimErrorState messageKey={moimErrorKey(error)} onRetry={reload} />
      </div>
    );
  }
  if (!moim) {
    return (
      <div className={`${moimCls.page} pt-3`}>
        <MoimListSkeleton rows={1} />
      </div>
    );
  }
  if (moim.viewer.status !== "active") {
    return (
      <div className={moimCls.page}>
        <MoimEmptyState>{t("moim_err_moim_not_member")}</MoimEmptyState>
      </div>
    );
  }

  return (
    <div className={`${moimCls.page} flex flex-col`}>
      <div className={`${moimCls.column} grid flex-1 content-start gap-4 px-4 pb-28 pt-4`}>
        <div className="flex items-center gap-3">
          <MoimAvatar url={avatar} name={nickname} size={64} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={uploading} className={`${moimCls.btnSecondary} ${moimCls.btnSm}`} onClick={() => fileRef.current?.click()}>
              {uploading ? t("common_loading") : t("moim_profile_photo_btn")}
            </button>
            {avatar ? (
              <button type="button" className={`${moimCls.btnSecondary} ${moimCls.btnSm}`} onClick={() => setAvatar(null)}>
                {t("moim_profile_photo_remove_btn")}
              </button>
            ) : null}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        </div>
        <label className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_profile_nickname_label")}</span>
          <input className={moimCls.input} value={nickname} maxLength={40} onChange={(e) => setNickname(e.target.value)} placeholder={t("moim_profile_nickname_placeholder")} />
        </label>
        <label className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_profile_bio_label")}</span>
          <textarea className={`${moimCls.textarea} min-h-[88px]`} value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t("moim_profile_bio_placeholder")} />
        </label>
        <p className={moimCls.noticeInfo}>{t("moim_profile_privacy_note")}</p>
        {saveError ? <p className={moimCls.noticeBad}>{saveError}</p> : null}
      </div>
      <div className="sticky bottom-0 border-t border-sam-border bg-sam-surface px-4 pb-[calc(12px+var(--safe-bottom,0px))] pt-2.5">
        <div className={moimCls.column}>
          <button type="button" className={`${moimCls.btnPrimary} w-full`} disabled={!nickname.trim() || busy || uploading} onClick={save}>
            {t("common_save")}
          </button>
        </div>
      </div>
      {toast.node}
    </div>
  );
}
