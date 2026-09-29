"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  deleteIntroMediaApi,
  listIntroMediaApi,
} from "./introMediaApi";
import { IntroMediaRuntimePreview } from "./IntroMediaRuntimePreview";
import { IntroMediaUpload } from "./IntroMediaUpload";
import {
  formatLabel,
  operatorStatusLabel,
  operatorStatusTone,
  safeFailureMessage,
  toOperatorStatus,
} from "./statusLabels";
import type { IntroMediaListItemDto } from "./types";

function formatWhen(iso: string, ko: boolean): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(ko ? "ko-KR" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function IntroMediaLibrary({
  ko,
  mode = "library",
  onSelectReady,
  onUploadReachedReady,
  selectedMediaRefId,
  selectionContext,
}: {
  ko: boolean;
  /** library = full page; picker = selectable grid */
  mode?: "library" | "picker";
  onSelectReady?: (item: IntroMediaListItemDto) => void;
  /** Fired when a brand-new PC upload reaches READY (picker auto-select). */
  onUploadReachedReady?: (item: IntroMediaListItemDto) => void;
  selectedMediaRefId?: string | null;
  /** Selection context only — does not fork Media systems. */
  selectionContext?: "IMAGE" | "LOGO" | "GIF" | "ANY";
}) {
  const [items, setItems] = useState<IntroMediaListItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  const load = useCallback(async (query?: string) => {
    setError(null);
    const res = await listIntroMediaApi(query);
    if (!res.ok) {
      setItems(null);
      setError(res.error ?? "list_failed");
      return;
    }
    setItems(res.items);
  }, []);

  useEffect(() => {
    void load(qApplied);
  }, [load, qApplied]);

  // Poll while any item is mid-lifecycle.
  useEffect(() => {
    if (!items) return;
    const pending = items.some((it) => {
      const s = toOperatorStatus(it.status);
      return s === "UPLOADING" || s === "PROCESSING";
    });
    if (!pending) return;
    const t = window.setInterval(() => void load(qApplied), 2500);
    return () => window.clearInterval(t);
  }, [items, load, qApplied]);

  const inspectItem = useMemo(
    () => items?.find((it) => it.mediaId === inspectId) ?? null,
    [items, inspectId],
  );

  const onUploadReady = async (args: { mediaId: string; mediaRefId: string }) => {
    await load(qApplied);
    const refreshed = await listIntroMediaApi(qApplied);
    const found =
      refreshed.items.find((it) => it.mediaId === args.mediaId) ?? null;
    if (found && toOperatorStatus(found.status) === "READY") {
      setInspectId(found.mediaId);
      onUploadReachedReady?.(found);
    }
  };

  const confirmDelete = async (item: IntroMediaListItemDto) => {
    const ok = window.confirm(
      ko
        ? `"${item.originalName}" 미디어를 삭제할까요?`
        : `Delete media "${item.originalName}"?`,
    );
    if (!ok) return;
    setBusyDelete(item.mediaId);
    setDeleteMsg(null);
    const { status, json } = await deleteIntroMediaApi(item.mediaId);
    setBusyDelete(null);
    if (status === 200 && json.ok === true) {
      if (inspectId === item.mediaId) setInspectId(null);
      await load(qApplied);
      return;
    }
    setDeleteMsg(
      safeFailureMessage(
        String(json.category ?? ""),
        String(json.message ?? ""),
        ko,
      ),
    );
  };

  void selectionContext;

  return (
    <div data-intro-media-library="1" data-mode={mode} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <IntroMediaUpload ko={ko} onReady={onUploadReady} />
        <div className="flex min-w-[220px] flex-1 items-center gap-2 sm:max-w-xs">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQApplied(q.trim());
            }}
            placeholder={ko ? "파일 이름으로 찾기" : "Find by filename"}
            className="min-h-9 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-sm text-sam-fg"
            data-testid="intro-media-search"
          />
          <AdminActionButton
            variant="secondary"
            onClick={() => setQApplied(q.trim())}
          >
            {ko ? "찾기" : "Find"}
          </AdminActionButton>
        </div>
      </div>

      {deleteMsg ? (
        <p className="text-sm text-red-800" role="alert">
          {deleteMsg}
        </p>
      ) : null}

      {error ? (
        <div
          className="rounded-ui-rect border border-red-300 bg-red-50 p-4"
          data-intro-media-state="error"
        >
          <p className="text-sm text-red-900">
            {ko
              ? "미디어 목록을 불러오지 못했습니다."
              : "Could not load the media library."}
          </p>
          <AdminActionButton
            variant="secondary"
            className="mt-3"
            onClick={() => void load(qApplied)}
          >
            {ko ? "다시 시도" : "Retry"}
          </AdminActionButton>
        </div>
      ) : items === null ? (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          data-intro-media-state="loading"
          aria-busy="true"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-ui-rect bg-sam-surface-muted"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface p-8 text-center"
          data-intro-media-state="empty"
        >
          <p className="text-sm font-medium text-sam-fg">
            {ko ? "아직 업로드된 미디어가 없습니다" : "No media yet"}
          </p>
          <p className="mt-1 text-sm text-sam-muted">
            {ko
              ? "PC에서 이미지를 올려 인트로에 사용할 미디어를 준비하세요."
              : "Upload an image from your PC to prepare intro media."}
          </p>
        </div>
      ) : (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          data-intro-media-state="list"
        >
          {items.map((item) => {
            const op = toOperatorStatus(item.status);
            const selectable = op === "READY" && mode === "picker";
            const selected = selectedMediaRefId === item.mediaRefId;
            return (
              <article
                key={item.mediaId}
                className={[
                  "overflow-hidden rounded-ui-rect border bg-sam-surface",
                  selected
                    ? "border-sky-600 ring-2 ring-sky-600/30"
                    : "border-sam-border",
                ].join(" ")}
                data-intro-media-card={item.mediaId}
                data-status={op}
                data-animated={item.animated ? "1" : "0"}
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => {
                    setInspectId(item.mediaId);
                    if (selectable) onSelectReady?.(item);
                  }}
                  disabled={mode === "picker" && op !== "READY"}
                >
                  <div className="relative aspect-square bg-sam-surface-muted">
                    {op === "READY" ? (
                      <IntroMediaRuntimePreview
                        mediaId={item.mediaId}
                        status={item.status}
                        animated={item.animated}
                        alt={item.originalName}
                        className="h-full w-full"
                        objectFit="cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-sam-muted">
                        {operatorStatusLabel(op, ko)}
                      </div>
                    )}
                    {item.animated && op === "READY" ? (
                      <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        GIF
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1 p-2.5">
                    <p className="truncate text-sm font-medium text-sam-fg">
                      {item.originalName || (ko ? "(이름 없음)" : "(untitled)")}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AdminToneBadge tone={operatorStatusTone(op)}>
                        {operatorStatusLabel(op, ko)}
                      </AdminToneBadge>
                      <span className="text-[11px] text-sam-muted">
                        {formatLabel(item.runtimeFormat, item.mime)}
                        {item.width && item.height
                          ? ` · ${item.width}×${item.height}`
                          : ""}
                      </span>
                    </div>
                    <p className="text-[11px] text-sam-muted">
                      {formatWhen(item.updatedAt, ko)}
                    </p>
                    {op === "FAILED" ? (
                      <p className="line-clamp-2 text-[11px] text-red-800">
                        {safeFailureMessage(
                          item.failureCode,
                          item.failureMessage,
                          ko,
                        )}
                      </p>
                    ) : null}
                  </div>
                </button>
                {mode === "library" ? (
                  <div className="flex gap-2 border-t border-sam-border px-2.5 py-2">
                    <AdminActionButton
                      variant="ghost"
                      className="!min-h-7 !px-2 !text-xs"
                      onClick={() => setInspectId(item.mediaId)}
                    >
                      {ko ? "자세히" : "Inspect"}
                    </AdminActionButton>
                    <AdminActionButton
                      variant="quiet"
                      className="!min-h-7 !px-2 !text-xs"
                      disabled={busyDelete === item.mediaId}
                      onClick={() => void confirmDelete(item)}
                    >
                      {ko ? "삭제" : "Delete"}
                    </AdminActionButton>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {inspectItem ? (
        <IntroMediaInspectPanel
          ko={ko}
          item={inspectItem}
          onClose={() => setInspectId(null)}
          onSelect={
            mode === "picker" && toOperatorStatus(inspectItem.status) === "READY"
              ? () => onSelectReady?.(inspectItem)
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

function IntroMediaInspectPanel({
  ko,
  item,
  onClose,
  onSelect,
}: {
  ko: boolean;
  item: IntroMediaListItemDto;
  onClose: () => void;
  onSelect?: () => void;
}) {
  const op = toOperatorStatus(item.status);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      data-intro-media-inspect={item.mediaId}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-lg">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-sam-fg">
              {item.originalName}
            </h2>
            <p className="mt-0.5 text-xs text-sam-muted">
              {formatLabel(item.runtimeFormat, item.mime)}
              {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
              {item.animated ? (ko ? " · 애니메이션" : " · animated") : ""}
            </p>
          </div>
          <AdminToneBadge tone={operatorStatusTone(op)}>
            {operatorStatusLabel(op, ko)}
          </AdminToneBadge>
        </div>

        <div className="aspect-video overflow-hidden rounded-ui-rect bg-sam-surface-muted">
          {op === "READY" ? (
            <IntroMediaRuntimePreview
              mediaId={item.mediaId}
              status={item.status}
              animated={item.animated}
              alt={item.originalName}
              className="h-full w-full"
              objectFit="contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-sam-muted">
              {op === "FAILED"
                ? safeFailureMessage(item.failureCode, item.failureMessage, ko)
                : operatorStatusLabel(op, ko)}
            </div>
          )}
        </div>

        {item.animated && op === "READY" ? (
          <p className="mt-2 text-xs text-sam-muted">
            {ko
              ? "애니메이션이 실제로 재생되어야 합니다. 첫 프레임만 보이면 안 됩니다."
              : "Animation must visibly advance — not a frozen first frame."}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <AdminActionButton variant="secondary" onClick={onClose}>
            {ko ? "닫기" : "Close"}
          </AdminActionButton>
          {onSelect ? (
            <AdminActionButton
              variant="primary"
              onClick={onSelect}
              data-testid="intro-media-inspect-select"
            >
              {ko ? "선택" : "Select"}
            </AdminActionButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
