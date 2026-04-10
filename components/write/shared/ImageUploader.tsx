"use client";

import { useCallback, useRef } from "react";

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
}

export function ImageUploader({
  value,
  onChange,
  maxCount = 10,
  label = "사진",
  disabled = false,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <section className={`border-b border-gray-100 bg-white px-4 py-4 ${disabled ? "opacity-60" : ""}`}>
      <p className="mb-3 text-[14px] font-medium text-gray-800">{label}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {value.map((item, index) => (
          <div
            key={index}
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-ui-rect bg-gray-100"
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
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-ui-rect border-2 border-dashed border-gray-300 text-gray-400 hover:border-gray-400"
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
