"use client";

import { useCallback, useRef, useState } from "react";
import { Camera } from "lucide-react";
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
  label = "사진",
  disabled = false,
  compact = false,
  variant = "default",
}: ImageUploaderProps) {
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

    return (
      <>
        <section
          className={`border-b border-sam-border-soft bg-sam-surface px-4 ${compact ? "py-2" : "py-3"} ${disabled ? "opacity-60" : ""}`}
        >
          <div className={compact ? "mb-1.5" : "mb-2"}>
            <span className="text-[15px] font-bold text-sam-fg">{label}</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {showAdd ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
                className={`${THUMB_CLASS} flex flex-col items-center justify-center border border-sam-border bg-sam-surface-muted`}
                aria-label="사진 추가"
              >
                <Camera className="h-7 w-7 stroke-[1.25] text-sam-muted" aria-hidden />
                <span className="pointer-events-none mt-1 sam-text-xxs font-medium text-signature">
                  {value.length}/{maxCount}
                </span>
              </button>
            ) : null}

            {value.map((item, index) => (
              <div key={`${item.url}-${index}`} className={THUMB_CLASS}>
                <button
                  type="button"
                  disabled={disabled}
                  className="absolute inset-0 z-0"
                  aria-label={`사진 ${index + 1} 편집`}
                  onClick={() => setEditorIndex(index)}
                />
                <img src={item.url} alt="" className="pointer-events-none h-full w-full object-cover" />
                {index === 0 ? (
                  <span className="pointer-events-none absolute bottom-0 left-0 right-0 bg-black/55 py-0.5 text-center sam-text-xxs leading-tight text-white">
                    대표 사진
                  </span>
                ) : null}
                {!disabled ? (
                  <button
                    type="button"
                    className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-[12px] leading-none text-white"
                    aria-label="삭제"
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
            ))}
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
        {label}
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
                aria-label="삭제"
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
