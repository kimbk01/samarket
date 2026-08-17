"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useCallback, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { ImageEditorModal } from "./ImageEditorModal";

export interface ImageUploadItem {
  file?: File;
  url: string;
}

interface ImageUploaderProps {
  value: ImageUploadItem[];
  onChange: (next: ImageUploadItem[]) => void;
  maxCount?: number;
  label?: string;
  /** 거래 잠금 시 이미지 변경 불가 */
  disabled?: boolean;
  /** 상단·라벨 여백 축소 (거래 글쓰기 등) */
  compact?: boolean;
  /** 당근형 — 가로 균일 썸네일 + 대표 오버레이 + 편집 (일반 중고) */
  variant?: "default" | "karrot";
}

const THUMB_CLASS = "relative h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted";

export function ImageUploader({
  value,
  onChange,
  maxCount = 10,
  label,
  disabled = false,
  compact = false,
  variant = "default",
}: ImageUploaderProps) {
  const { t } = useI18n();
  const resolvedLabel = label ?? t("trade_write_photos");
  const inputRef = useRef<HTMLInputElement>(null);
  const isKarrot = variant === "karrot";
  const [editorIndex, setEditorIndex] = useState<number | null>(null);

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (disabled) return;
      if (!files?.length || value.length >= maxCount) return;
      const next = [...value];
      for (let i = 0; i < files.length && next.length < maxCount; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        next.push({ file, url: URL.createObjectURL(file) });
      }
      onChange(next);
    },
    [disabled, value, maxCount, onChange]
  );

  const removeAt = useCallback(
    (index: number) => {
      if (disabled) return;
      const item = value[index];
      if (item?.url?.startsWith("blob:")) URL.revokeObjectURL(item.url);
      onChange(value.filter((_, i) => i !== index));
    },
    [disabled, value, onChange]
  );

  const replaceAt = useCallback(
    (index: number, file: File) => {
      if (disabled) return;
      const old = value[index];
      if (old?.url?.startsWith("blob:")) URL.revokeObjectURL(old.url);
      const url = URL.createObjectURL(file);
      const next = [...value];
      next[index] = { file, url };
      onChange(next);
    },
    [disabled, value, onChange]
  );

  const editorUrl = editorIndex !== null ? value[editorIndex]?.url ?? "" : "";

  if (isKarrot) {
    const showAdd = value.length < maxCount && !disabled;
    const cover = value[0];

    return (
      <>
        <section className={`border-b border-sam-border-soft bg-sam-surface px-4 py-3 ${disabled ? "opacity-60" : ""}`}>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold text-sam-fg">{resolvedLabel}</span>
            <span className="sam-text-xxs text-sam-muted">
              {value.length}/{maxCount}
            </span>
          </div>

          {cover ? (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-ui-rect bg-sam-surface-muted">
              <button
                type="button"
                disabled={disabled}
                className="absolute inset-0 z-0"
                aria-label={t("trade_write_image_edit_aria", { index: "1" })}
                onClick={() => setEditorIndex(0)}
              />
              <SamarketThumbnail
                src={cover.url}
                alt=""
                fill
                className="pointer-events-none"
                roundedClassName="rounded-ui-rect"
                imageClassName="object-cover"
                loading="eager"
              />
              <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 sam-text-xxs text-white">
                {t("trade_write_cover_photo")}
              </span>
              {!disabled ? (
                <button
                  type="button"
                  className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-[14px] leading-none text-white"
                  aria-label={t("common_delete")}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeAt(0);
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          ) : showAdd ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-ui-rect border border-dashed border-sam-border bg-sam-surface-muted"
              aria-label={t("ui_write_image_add_aria")}
            >
              <Camera className="h-8 w-8 stroke-[1.25] text-sam-primary" aria-hidden />
              <span className="mt-2 text-[14px] font-medium text-sam-fg">{t("ui_write_image_add_aria")}</span>
            </button>
          ) : null}

          {value.length > 0 ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {value.slice(1).map((item, i) => {
                const index = i + 1;
                return (
                  <div key={`${item.url}-${index}`} className={THUMB_CLASS}>
                    <button
                      type="button"
                      disabled={disabled}
                      className="absolute inset-0 z-0"
                      aria-label={t("trade_write_image_edit_aria", { index: String(index + 1) })}
                      onClick={() => setEditorIndex(index)}
                    />
                    <SamarketThumbnail
                      src={item.url}
                      alt=""
                      fill
                      className="pointer-events-none"
                      roundedClassName="rounded-ui-rect"
                      imageClassName="object-cover"
                    />
                    {!disabled ? (
                      <button
                        type="button"
                        className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-[12px] leading-none text-white"
                        aria-label={t("common_delete")}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeAt(index);
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {showAdd ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => inputRef.current?.click()}
                  className={`${THUMB_CLASS} flex flex-col items-center justify-center border border-dashed border-sam-border bg-sam-surface-muted`}
                  aria-label={t("ui_write_image_add_aria")}
                >
                  <Camera className="h-6 w-6 stroke-[1.25] text-sam-muted" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </section>

        <ImageEditorModal
          open={editorIndex !== null && !!editorUrl}
          imageUrl={editorUrl}
          onClose={() => setEditorIndex(null)}
          onComplete={(file) => {
            setEditorIndex((idx) => {
              if (idx !== null) replaceAt(idx, file);
              return null;
            });
          }}
        />
      </>
    );
  }

  return (
    <section
      className={`border-b border-sam-border-soft bg-sam-surface px-4 ${compact ? "py-2" : "py-4"} ${disabled ? "opacity-60" : ""}`}
    >
      <p className={`sam-text-body font-medium text-sam-fg ${compact ? "mb-1.5 leading-tight" : "mb-3"}`}>
        {resolvedLabel}
      </p>
      <div className={`flex gap-2 overflow-x-auto ${compact ? "pb-0" : "pb-1"}`}>
        {value.map((item, index) => (
          <div
            key={index}
            className={`relative shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted ${compact ? "h-20 w-20" : "h-24 w-24"}`}
          >
            <img src={item.url} alt="" className="h-full w-full object-cover" />
            {!disabled ? (
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white"
                aria-label={t("common_delete")}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        {value.length < maxCount && !disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`flex shrink-0 items-center justify-center rounded-ui-rect border-2 border-dashed border-sam-border text-sam-meta hover:border-sam-border ${compact ? "h-20 w-20 text-lg" : "h-24 w-24"}`}
          >
            +
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </section>
  );
}
