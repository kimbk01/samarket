"use client";

import { useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { IntroMediaLibrary } from "./IntroMediaLibrary";
import type {
  IntroMediaListItemDto,
  IntroMediaPickerContext,
  IntroMediaPickerResult,
} from "./types";

/**
 * Reusable Media Picker — ONE authority for IMAGE and LOGO.
 * Returns mediaRefId only (IntroDocumentV1 authored identity).
 * Does NOT return storage path / runtimeArtifactId / signed URL as document authority.
 *
 * Replace preparation: caller keeps old mediaRefId until this returns a new READY selection.
 * Cancel → null / no mutation of caller selection.
 */
export function IntroMediaPicker({
  ko,
  open,
  context = "ANY",
  initialMediaRefId = null,
  onConfirm,
  onCancel,
}: {
  ko: boolean;
  open: boolean;
  context?: IntroMediaPickerContext;
  /** Preserved until new READY selection is confirmed — never cleared preemptively. */
  initialMediaRefId?: string | null;
  onConfirm: (result: IntroMediaPickerResult) => void;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState<IntroMediaListItemDto | null>(null);
  const [tab, setTab] = useState<"existing" | "upload">("existing");

  if (!open) return null;

  const contextLabel =
    context === "LOGO"
      ? ko
        ? "로고"
        : "Logo"
      : context === "IMAGE"
        ? ko
          ? "이미지"
          : "Image"
        : context === "GIF"
          ? "GIF"
          : ko
            ? "미디어"
            : "Media";

  const confirmSelection = (item: IntroMediaListItemDto) => {
    if (item.status !== "READY") return;
    onConfirm({
      mediaRefId: item.mediaRefId,
      mediaId: item.mediaId,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      data-intro-media-picker="1"
      data-picker-context={context}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-sam-border px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-sam-fg">
              {ko ? `${contextLabel} 선택` : `Select ${contextLabel}`}
            </h2>
            <p className="mt-0.5 text-xs text-sam-muted">
              {ko
                ? "기존 미디어를 고르거나 PC에서 새로 업로드하세요. 준비된 미디어만 선택할 수 있습니다."
                : "Pick existing media or upload from PC. Only Ready media can be selected."}
            </p>
            {initialMediaRefId ? (
              <p className="mt-1 text-[11px] text-sam-muted">
                {ko
                  ? "이전 선택은 새 선택이 확정될 때까지 유지됩니다."
                  : "Previous selection is kept until a new Ready selection is confirmed."}
              </p>
            ) : null}
          </div>
          <AdminActionButton variant="quiet" onClick={onCancel}>
            {ko ? "취소" : "Cancel"}
          </AdminActionButton>
        </header>

        <div className="flex gap-2 border-b border-sam-border px-4 py-2">
          <AdminActionButton
            variant={tab === "existing" ? "primary" : "secondary"}
            onClick={() => setTab("existing")}
          >
            {ko ? "기존 미디어" : "Select existing"}
          </AdminActionButton>
          <AdminActionButton
            variant={tab === "upload" ? "primary" : "secondary"}
            onClick={() => setTab("upload")}
          >
            {ko ? "새로 업로드" : "Upload new"}
          </AdminActionButton>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <IntroMediaLibrary
            ko={ko}
            mode="picker"
            selectionContext={context === "ANY" ? "IMAGE" : context}
            selectedMediaRefId={pending?.mediaRefId ?? initialMediaRefId}
            onSelectReady={(item) => {
              setPending(item);
            }}
            onUploadReachedReady={(item) => {
              // Locked operator workflow: upload → processing → READY → select.
              // Do not force operator to hunt for the file they just uploaded.
              confirmSelection(item);
            }}
          />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-sam-border px-4 py-3">
          <p className="text-xs text-sam-muted">
            {pending
              ? ko
                ? `선택 대기: ${pending.originalName}`
                : `Pending: ${pending.originalName}`
              : ko
                ? "미디어를 선택하세요"
                : "Select a media item"}
          </p>
          <div className="flex gap-2">
            <AdminActionButton variant="secondary" onClick={onCancel}>
              {ko ? "취소" : "Cancel"}
            </AdminActionButton>
            <AdminActionButton
              variant="primary"
              disabled={!pending || pending.status !== "READY"}
              onClick={() => pending && confirmSelection(pending)}
              data-testid="intro-media-picker-confirm"
            >
              {ko ? "이 미디어 사용" : "Use this media"}
            </AdminActionButton>
          </div>
        </footer>
      </div>
    </div>
  );
}
