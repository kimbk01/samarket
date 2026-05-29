"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { OwnerStoreLogoCameraIcon } from "@/components/business/owner/OwnerStoreLogoCameraIcon";
import {
  OWNER_STORE_FORM_HINT_CLASS,
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_FIELD_LABEL_CLASS,
  OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS,
} from "@/lib/business/owner-store-stack";
import { Biz } from "@/lib/ui/biz-component-classes";

const LOGO_OUTER_CLASS = "relative h-28 w-28 shrink-0";
const LOGO_INNER_CLASS =
  "h-28 w-28 overflow-hidden rounded-[18px] border border-[var(--biz-card-border)] bg-[var(--biz-tan-soft)]";

/** 배민식 프로필 촬영 버튼 — 썸네일 우하단에 붙는 원형 배지 */
const CAMERA_OVERLAY_CLASS =
  "absolute bottom-0 right-0 z-10 flex h-12 w-12 translate-x-[18%] translate-y-[18%] items-center justify-center rounded-full border-2 border-[var(--biz-card-bg)] bg-[var(--biz-card-bg)] p-0 text-[var(--biz-primary)] shadow-none outline-none ring-1 ring-[var(--biz-card-border)] transition-transform hover:text-[var(--biz-primary-hover)] active:scale-95 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--biz-primary)]/35 focus-visible:ring-offset-1";

const INTRO_TEXTAREA_CLASS = `${OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS} min-h-[2.75rem] resize-none overflow-hidden rounded-[14px] bg-[var(--biz-card-bg)] leading-snug`;

function AutoGrowIntroTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 44)}px`;
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        syncHeight();
      }}
      onKeyDown={() => {
        requestAnimationFrame(syncHeight);
      }}
      className={INTRO_TEXTAREA_CLASS}
    />
  );
}

export type OwnerBasicInfoBrandingHeroProps = {
  logoLabel: string;
  storeNameLabel: string;
  introLabel: string;
  storeNameHint: string;
  introPlaceholder: string;
  noneLabel: string;
  uploadingLabel: string | null;
  changePhotoAria: string;
  addPhotoAria: string;
  changePhotoSr: string;
  addPhotoSr: string;
  profileImageUrl: string;
  shopName: string;
  description: string;
  identityEditable: boolean;
  uploading: boolean;
  profileFileInputRef: RefObject<HTMLInputElement | null>;
  onPickFile: (file: File) => void;
  onShopNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
};

export function OwnerBasicInfoBrandingHero({
  logoLabel,
  storeNameLabel,
  introLabel,
  storeNameHint,
  introPlaceholder,
  noneLabel,
  uploadingLabel,
  changePhotoAria,
  addPhotoAria,
  changePhotoSr,
  addPhotoSr,
  profileImageUrl,
  shopName,
  description,
  identityEditable,
  uploading,
  profileFileInputRef,
  onPickFile,
  onShopNameChange,
  onDescriptionChange,
}: OwnerBasicInfoBrandingHeroProps) {
  const hasLogo = profileImageUrl.trim().length > 0;

  return (
    <div className="rounded-[20px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-4">
      <div className="flex gap-4 sm:gap-5">
        <div className="shrink-0 pb-2">
          <p className={`${OWNER_STORE_PROFILE_FIELD_LABEL_CLASS} mb-2 text-[var(--biz-text-muted)]`}>
            {logoLabel}
          </p>
          <div className={LOGO_OUTER_CLASS}>
            <div className={LOGO_INNER_CLASS}>
              {hasLogo ? (
                <img src={profileImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-[11px] text-[var(--biz-text-muted)]">
                  {noneLabel}
                </div>
              )}
            </div>
            <input
              ref={profileFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => profileFileInputRef.current?.click()}
              className={CAMERA_OVERLAY_CLASS}
              aria-label={hasLogo ? changePhotoAria : addPhotoAria}
            >
              <OwnerStoreLogoCameraIcon className="h-8 w-8 shrink-0" />
              <span className="sr-only">{hasLogo ? changePhotoSr : addPhotoSr}</span>
            </button>
          </div>
          {uploadingLabel ? (
            <p className="mt-1.5 text-[12px] text-[var(--biz-text-muted)]">{uploadingLabel}</p>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className={`${OWNER_STORE_PROFILE_FIELD_LABEL_CLASS} text-[var(--biz-text)]`}>
            {storeNameLabel}
          </p>
          <p className={`${OWNER_STORE_FORM_HINT_CLASS} mb-2 text-[var(--biz-text-muted)]`}>
            {storeNameHint}
          </p>
          {identityEditable ? (
            <input
              type="text"
              value={shopName}
              onChange={(e) => onShopNameChange(e.target.value)}
              autoComplete="organization"
              className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} min-h-[48px] rounded-[14px] bg-[var(--biz-card-bg)] text-[16px] font-semibold text-[var(--biz-text)]`}
            />
          ) : (
            <p className={`${Biz.textCardTitle} break-words`}>{shopName.trim() || noneLabel}</p>
          )}
        </div>
      </div>

      <div className="mt-5">
        <label className={`${OWNER_STORE_PROFILE_FIELD_LABEL_CLASS} text-[var(--biz-text)]`}>
          {introLabel}
        </label>
        <AutoGrowIntroTextarea
          value={description}
          onChange={onDescriptionChange}
          placeholder={introPlaceholder}
        />
      </div>
    </div>
  );
}
