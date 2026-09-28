"use client";

import { useCallback, useEffect, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { applyIntroV3LibraryOutcome } from "@/lib/startup/intro-v3/media-library";
import { isIntroV3ProcessErrorCode } from "@/lib/startup/intro-v3/media-policy";
import type {
  IntroV3LibraryIntent,
  IntroV3LibrarySelection,
  IntroV3MediaDerivative,
  IntroV3MediaSource,
} from "@/lib/startup/intro-v3/media-types";

const ERROR_KEYS: Record<string, MessageKey> = {
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

type LibraryItem = { source: IntroV3MediaSource; derivative: IntroV3MediaDerivative };

export function IntroV3MediaLibrary({
  open,
  intent,
  onClose,
  onSelect,
}: {
  open: boolean;
  intent: IntroV3LibraryIntent;
  onClose: () => void;
  onSelect: (selection: IntroV3LibrarySelection) => void;
}) {
  const { safeT } = useI18n();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [picked, setPicked] = useState<LibraryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/intro-v3/media", { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: LibraryItem[] };
    setItems(json.items ?? []);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setError(null);
    void load();
  }, [open, load]);

  if (!open) return null;

  function errorText(code: string): string {
    const key = ERROR_KEYS[isIntroV3ProcessErrorCode(code) ? code : "processing_failed"];
    const fallbacks: Record<string, { ko: string; en: string }> = {
      admin_intro_v3_err_unsupported_format: {
        ko: "이 파일 형식은 사용할 수 없습니다. JPG, PNG, 정적 WebP만 가능합니다.",
        en: "This file type cannot be used. Use JPG, PNG, or static WebP.",
      },
      admin_intro_v3_err_source_too_large: { ko: "원본 파일이 너무 큽니다.", en: "The original file is too large." },
      admin_intro_v3_err_source_pixels_too_large: {
        ko: "원본 이미지 해상도가 너무 큽니다.",
        en: "The original image resolution is too large.",
      },
      admin_intro_v3_err_decode_failed: { ko: "이미지를 열 수 없습니다.", en: "The image could not be opened." },
      admin_intro_v3_err_processing_failed: {
        ko: "이미지를 처리하지 못했습니다.",
        en: "The image could not be processed.",
      },
      admin_intro_v3_err_network_upload_failed: {
        ko: "파일 전송에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.",
        en: "File transfer failed. Check the network and try again.",
      },
      admin_intro_v3_err_storage_failed: { ko: "저장소에 파일을 올리지 못했습니다.", en: "The file could not be stored." },
      admin_intro_v3_err_asset_persistence_failed: {
        ko: "파일 정보를 저장하지 못했습니다.",
        en: "File metadata could not be saved.",
      },
      admin_intro_v3_err_derivative_failed: {
        ko: "미리보기용 이미지를 만들지 못했습니다.",
        en: "The preview image could not be created.",
      },
    };
    const fb = fallbacks[key] ?? fallbacks.admin_intro_v3_err_processing_failed;
    return safeT(key, { fallbackKo: fb.ko, fallbackEn: fb.en });
  }

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const signRes = await fetch("/api/admin/intro-v3/media/sign", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mime: file.type, bytes: file.size }),
      });
      const signJson = (await signRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sourceId?: string;
        signedUrl?: string;
      };
      if (!signRes.ok || !signJson.ok || !signJson.signedUrl || !signJson.sourceId) {
        setError(errorText(signJson.error ?? "storage_failed"));
        return;
      }
      const put = await fetch(signJson.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "false",
        },
        body: file,
      });
      if (!put.ok) {
        setError(errorText("network_upload_failed"));
        return;
      }
      const processRes = await fetch("/api/admin/intro-v3/media/process", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: signJson.sourceId }),
      });
      const processJson = (await processRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        source?: IntroV3MediaSource;
        derivative?: IntroV3MediaDerivative;
      };
      if (!processRes.ok || !processJson.ok || !processJson.source || !processJson.derivative) {
        setError(errorText(processJson.error ?? "processing_failed"));
        return;
      }
      const item = { source: processJson.source, derivative: processJson.derivative };
      setPicked(item);
      await load();
    } catch {
      setError(errorText("network_upload_failed"));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    applyIntroV3LibraryOutcome({ kind: "cancel" });
    onClose();
  }

  function confirm() {
    if (!picked) return;
    const applied = applyIntroV3LibraryOutcome({
      kind: "select",
      selection: {
        intent,
        mediaRef: { sourceId: picked.source.id, derivativeId: picked.derivative.id },
        source: picked.source,
        derivative: picked.derivative,
      },
    });
    if (applied.selected) onSelect(applied.selected);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-section-title text-sam-fg">
          {safeT("admin_intro_v3_media_title", { fallbackKo: "미디어 라이브러리", fallbackEn: "Media library" })}
        </h2>
        <label className="mt-4 inline-flex min-h-9 cursor-pointer items-center rounded-ui-rect border border-sam-border px-3 py-1.5 text-[13px] font-semibold text-sam-fg">
          {safeT("admin_intro_v3_upload_pc", { fallbackKo: "컴퓨터에서 업로드", fallbackEn: "Upload from computer" })}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadFile(file);
            }}
          />
        </label>
        {busy ? (
          <p className="mt-3 sam-text-helper text-sam-muted">
            {safeT("admin_intro_v3_processing", { fallbackKo: "처리 중…", fallbackEn: "Processing…" })}
          </p>
        ) : null}
        {error ? <p className="mt-3 sam-text-body text-red-700">{error}</p> : null}
        <p className="mt-4 sam-text-helper text-sam-muted">
          {safeT("admin_intro_v3_recent", { fallbackKo: "최근 파일", fallbackEn: "Recent files" })}
        </p>
        <ul className="mt-2 grid grid-cols-3 gap-2">
          {items.map((item) => {
            const selected = picked?.source.id === item.source.id;
            return (
              <li key={item.source.id}>
                <button
                  type="button"
                  className={`w-full rounded-ui-rect border p-1 text-left ${
                    selected ? "border-sam-fg" : "border-sam-border"
                  }`}
                  onClick={() => setPicked(item)}
                >
                  <SamarketThumbnail
                    src={item.derivative.publicUrl}
                    alt={item.source.filename}
                    className="aspect-square w-full"
                    fill
                  />
                  <span className="mt-1 block truncate text-[11px] text-sam-fg">{item.source.filename}</span>
                  <span className="block text-[10px] text-sam-muted">
                    {item.derivative.width}x{item.derivative.height} · {item.source.mime.replace("image/", "").toUpperCase()}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex min-h-9 items-center rounded-ui-rect border border-sam-border px-3 py-1.5 text-[13px] font-semibold text-sam-fg"
            onClick={cancel}
            disabled={busy}
          >
            {safeT("admin_intro_v3_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
          </button>
          <button
            type="button"
            className="inline-flex min-h-9 items-center rounded-ui-rect bg-[var(--admin-action-primary-bg,#111827)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
            onClick={confirm}
            disabled={busy || !picked}
          >
            {safeT("admin_intro_v3_select", { fallbackKo: "선택", fallbackEn: "Select" })}
          </button>
        </div>
      </div>
    </div>
  );
}
