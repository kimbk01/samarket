"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/message-key";
import type { IntroV3LibraryIntent, IntroV3LibrarySelection } from "@/lib/startup/intro-v3/media-types";
import { isIntroV3ProcessErrorCode } from "@/lib/startup/intro-v3/media-policy";
import {
  fetchIntroV3ReadyMediaCatalog,
  introV3CatalogDimensionsLabel,
  introV3CatalogPublicUrl,
  introV3CatalogToken,
  selectionFromCatalogItem,
  uploadAndProcessIntroV3Still,
  type IntroV3ReadyCatalogItem,
} from "@/lib/startup/intro-v3/media-upload-client";

const PROCESS_ERROR_KEYS: Record<string, MessageKey> = {
  unsupported_format: "admin_intro_v3_err_unsupported_format",
  source_too_large: "admin_intro_v3_err_source_too_large",
  source_pixels_too_large: "admin_intro_v3_err_source_pixels_too_large",
  decode_failed: "admin_intro_v3_err_decode_failed",
  processing_failed: "admin_intro_v3_err_processing_failed",
  network_upload_failed: "admin_intro_v3_err_network_upload_failed",
  storage_failed: "admin_intro_v3_err_storage_failed",
  asset_persistence_failed: "admin_intro_v3_err_asset_persistence_failed",
  derivative_failed: "admin_intro_v3_err_derivative_failed",
};

export function IntroMediaLibrary({
  intent,
  onCancel,
  onReady,
  onCatalogReady,
}: {
  intent: IntroV3LibraryIntent;
  onCancel: () => void;
  onReady: (selection: IntroV3LibrarySelection) => void;
  onCatalogReady?: (item: IntroV3ReadyCatalogItem) => void;
}) {
  const { safeT } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [items, setItems] = useState<IntroV3ReadyCatalogItem[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const listed = await fetchIntroV3ReadyMediaCatalog();
    setItems(listed);
  }, []);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  const processError = (code: string) => {
    const key = isIntroV3ProcessErrorCode(code)
      ? PROCESS_ERROR_KEYS[code]
      : PROCESS_ERROR_KEYS.processing_failed;
    return safeT(key ?? "admin_intro_v3_err_processing_failed", {
      fallbackKo: "이미지를 처리하지 못했습니다.",
      fallbackEn: "The image could not be processed.",
    });
  };

  const commitItem = (item: IntroV3ReadyCatalogItem) => {
    const selection = selectionFromCatalogItem(item, intent);
    if (!selection) return;
    onCatalogReady?.(item);
    onReady(selection);
  };

  const onUploadFile = async (file: File | undefined) => {
    if (!file) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProcessing(true);
    setError(null);
    const result = await uploadAndProcessIntroV3Still(file, { signal: controller.signal });
    if (controller.signal.aborted || (!result.ok && result.cancelled)) {
      setProcessing(false);
      return;
    }
    setProcessing(false);
    if (!result.ok) {
      setError(processError(result.error));
      return;
    }
    setItems((current) => [result.item, ...current.filter((item) => introV3CatalogToken(item) !== introV3CatalogToken(result.item))]);
    commitItem(result.item);
  };

  const selected = items.find((item) => introV3CatalogToken(item) === picked) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-intro-media-library="1">
      <div className="flex max-h-[min(40rem,90dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        <div className="flex items-center justify-between gap-2 border-b border-sam-border px-4 py-3">
          <h2 className="text-[15px] font-semibold text-sam-fg">
            {safeT("admin_intro_v3_media_title", { fallbackKo: "미디어 라이브러리", fallbackEn: "Media library" })}
          </h2>
          <AdminActionButton
            variant="quiet"
            onClick={() => {
              abortRef.current?.abort();
              onCancel();
            }}
            data-intro-library-cancel="1"
          >
            {safeT("admin_intro_v3_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
          </AdminActionButton>
        </div>
        <div className="flex items-center gap-2 border-b border-sam-border px-4 py-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="hidden"
            data-intro-upload-pc-input="1"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void onUploadFile(file);
            }}
          />
          <AdminActionButton
            variant="primary"
            disabled={processing}
            onClick={() => inputRef.current?.click()}
            data-intro-upload-pc="1"
          >
            {safeT("admin_intro_upload_from_pc", { fallbackKo: "PC에서 업로드", fallbackEn: "Upload from computer" })}
          </AdminActionButton>
          {processing ? (
            <span className="text-[13px] text-sam-muted" data-intro-processing="1">
              {safeT("admin_intro_v3_processing", { fallbackKo: "처리 중…", fallbackEn: "Processing…" })}
            </span>
          ) : null}
        </div>
        {error ? <p className="px-4 py-2 text-[13px] text-red-800">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="text-[13px] text-sam-muted">
              {safeT("admin_intro_v3_no_selection", {
                fallbackKo: "아직 선택한 파일이 없습니다.",
                fallbackEn: "No file selected yet.",
              })}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((item) => {
                const token = introV3CatalogToken(item);
                const url = introV3CatalogPublicUrl(item);
                const filename = item.source.filename || "image";
                const dims = introV3CatalogDimensionsLabel(item);
                return (
                  <li key={token}>
                    <button
                      type="button"
                      onClick={() => setPicked(token)}
                      className={`w-full rounded-ui-rect border p-2 text-left ${
                        picked === token ? "border-sam-brand ring-2 ring-sam-brand/30" : "border-sam-border"
                      }`}
                      data-intro-library-item={token}
                    >
                      <div className="relative aspect-square overflow-hidden rounded-ui-rect bg-sam-app">
                        {url ? (
                          <SamarketThumbnail src={url} alt="" fill className="h-full w-full" roundedClassName="rounded-ui-rect" />
                        ) : null}
                      </div>
                      <p className="mt-2 truncate text-[13px] font-medium text-sam-fg">{filename}</p>
                      {dims ? <p className="text-[12px] text-sam-muted">{dims}</p> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-sam-border px-4 py-3">
          <AdminActionButton
            variant="secondary"
            onClick={() => {
              abortRef.current?.abort();
              onCancel();
            }}
          >
            {safeT("admin_intro_v3_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
          </AdminActionButton>
          <AdminActionButton
            variant="primary"
            disabled={!selected || processing}
            onClick={() => selected && commitItem(selected)}
            data-intro-library-select="1"
          >
            {safeT("admin_intro_v3_select", { fallbackKo: "선택", fallbackEn: "Select" })}
          </AdminActionButton>
        </div>
      </div>
    </div>
  );
}
