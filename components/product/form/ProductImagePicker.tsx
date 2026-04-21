"use client";

import { useCallback, useRef } from "react";

export type ImagePreviewItem = { file?: File; url: string };

interface ProductImagePickerProps {
  value: ImagePreviewItem[];
  onChange: (next: ImagePreviewItem[]) => void;
  maxCount?: number;
}

export function ProductImagePicker({
  value,
  onChange,
  maxCount = 10,
}: ProductImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length || value.length >= maxCount) return;
      const next = [...value];
      for (let i = 0; i < files.length && next.length < maxCount; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        next.push({ file, url: URL.createObjectURL(file) });
      }
      onChange(next);
    },
    [value, maxCount, onChange]
  );

  const removeAt = useCallback(
    (index: number) => {
      const item = value[index];
      if (item?.url?.startsWith("blob:")) URL.revokeObjectURL(item.url);
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange]
  );

  return (
    <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-4">
      <p className="mb-3 sam-text-body font-medium text-sam-fg">사진</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {value.map((item, index) => (
          <div key={index} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
            <img src={item.url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white"
              aria-label="삭제"
            >
              ×
            </button>
          </div>
        ))}
        {value.length < maxCount && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-ui-rect border-2 border-dashed border-sam-border text-sam-meta"
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
