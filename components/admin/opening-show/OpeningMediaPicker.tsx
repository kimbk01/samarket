"use client";

import { useRef } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpeningReadyMedia } from "@/lib/opening-show/types";

export function OpeningMediaPicker({
  media,
  busy,
  error,
  onClose,
  onUploadFile,
  onPickReady,
}: {
  media: OpeningReadyMedia[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onUploadFile: (file: File) => void;
  onPickReady: (item: OpeningReadyMedia) => void;
}) {
  const { safeT } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ready = media.filter((item) => item.thumbUrl && item.displayUrl);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        data-opening-picker="1"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-ui-rect bg-sam-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-sam-border px-4 py-3">
          <h2 className="text-base font-semibold text-sam-fg">
            {safeT("admin_opening_picker_title", {
              fallbackKo: "이미지 선택",
              fallbackEn: "Choose image",
            })}
          </h2>
          <AdminActionButton variant="quiet" onClick={onClose} disabled={busy}>
            {safeT("admin_opening_picker_close", { fallbackKo: "닫기", fallbackEn: "Close" })}
          </AdminActionButton>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="sr-only"
            data-opening-file-input="1"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUploadFile(file);
            }}
          />
          <AdminActionButton
            variant="primary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {safeT("admin_opening_picker_upload", {
              fallbackKo: "컴퓨터에서 업로드",
              fallbackEn: "Upload from computer",
            })}
          </AdminActionButton>
          {busy ? (
            <p className="text-sm text-sam-muted">
              {safeT("admin_opening_uploading", {
                fallbackKo: "이미지 처리 중…",
                fallbackEn: "Processing image…",
              })}
            </p>
          ) : null}
        </div>
        {error ? <p className="px-4 pb-2 text-sm text-red-700">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
          {ready.length === 0 ? (
            <p className="py-8 text-sm text-sam-muted">
              {safeT("admin_opening_picker_empty", {
                fallbackKo: "READY 상태의 이미지가 없습니다. 컴퓨터에서 업로드하세요.",
                fallbackEn: "No READY images yet. Upload from your computer.",
              })}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {ready.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={busy}
                    className="flex w-full flex-col gap-1 text-left"
                    onClick={() => onPickReady(item)}
                  >
                    <div className="relative aspect-square w-full">
                      <SamarketThumbnail
                        src={item.thumbUrl}
                        alt={item.fileName}
                        fill
                        className="h-full w-full"
                        roundedClassName="rounded-ui-rect"
                      />
                    </div>
                    <span className="truncate text-xs text-sam-fg">{item.fileName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
