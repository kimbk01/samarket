"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  runIntroMediaUploadPipeline,
  type UploadPipelineProgress,
} from "./introMediaApi";
import {
  ACCEPTED_INTRO_MEDIA_ACCEPT,
  ACCEPTED_INTRO_MEDIA_MIME,
} from "./types";
import { safeFailureMessage } from "./statusLabels";

function stageLabel(stage: UploadPipelineProgress["stage"], ko: boolean): string {
  if (!ko) {
    switch (stage) {
      case "creating":
        return "Preparing…";
      case "uploading":
        return "Upload in progress";
      case "confirming":
        return "Upload complete — confirming…";
      case "processing":
        return "Processing media…";
      case "ready":
        return "Ready";
      case "failed":
        return "Failed";
      default:
        return "";
    }
  }
  switch (stage) {
    case "creating":
      return "준비 중…";
    case "uploading":
      return "업로드 중";
    case "confirming":
      return "업로드 완료 — 확인 중…";
    case "processing":
      return "미디어 처리 중…";
    case "ready":
      return "준비됨";
    case "failed":
      return "실패";
    default:
      return "";
  }
}

/**
 * PC upload entry. Create is invoked ONLY after a File is chosen —
 * browser picker cancel → Media mutation = 0.
 */
export function IntroMediaUpload({
  ko,
  mediaKind = "IMAGE",
  onReady,
  onFailed,
  disabled,
}: {
  ko: boolean;
  mediaKind?: "IMAGE" | "LOGO" | "GIF";
  onReady?: (args: { mediaId: string; mediaRefId: string }) => void;
  onFailed?: (args: {
    mediaId: string | null;
    category: string;
    message: string;
  }) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadPipelineProgress | null>(null);
  const busy =
    progress !== null &&
    progress.stage !== "ready" &&
    progress.stage !== "failed" &&
    progress.stage !== "idle";

  const openPicker = () => {
    if (disabled || busy) return;
    setProgress(null);
    inputRef.current?.click();
  };

  const onFileChange = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0] ?? null;
    // Reset so the same file can be re-selected later.
    ev.target.value = "";
    if (!file) {
      // Cancelled picker — no create, no ghost card.
      return;
    }
    if (file.type && !ACCEPTED_INTRO_MEDIA_MIME.has(file.type)) {
      const msg = ko
        ? "지원하지 않는 파일 형식입니다. JPEG, PNG, WebP, GIF만 업로드할 수 있습니다."
        : "Unsupported format. Use JPEG, PNG, WebP, or GIF.";
      setProgress({
        stage: "failed",
        transportPercent: null,
        mediaId: null,
        mediaRefId: null,
        errorCategory: "UNSUPPORTED_FORMAT",
        errorMessage: msg,
      });
      onFailed?.({ mediaId: null, category: "UNSUPPORTED_FORMAT", message: msg });
      return;
    }

    const result = await runIntroMediaUploadPipeline({
      file,
      mediaKind,
      onProgress: setProgress,
    });

    if (result.ok && result.mediaId && result.mediaRefId) {
      onReady?.({ mediaId: result.mediaId, mediaRefId: result.mediaRefId });
    } else {
      onFailed?.({
        mediaId: result.mediaId ?? null,
        category: result.errorCategory ?? "UPLOAD_FAILED",
        message: result.errorMessage ?? "upload failed",
      });
    }
  };

  return (
    <div data-intro-media-upload="1" className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_INTRO_MEDIA_ACCEPT}
        className="hidden"
        onChange={onFileChange}
        data-testid="intro-media-file-input"
      />
      <AdminActionButton
        variant="primary"
        onClick={openPicker}
        disabled={disabled || busy}
        data-testid="intro-media-pc-upload"
      >
        {ko ? "PC에서 업로드" : "Upload from PC"}
      </AdminActionButton>
      <p className="text-xs text-sam-muted">
        {ko
          ? "JPEG · PNG · WebP · GIF"
          : "JPEG · PNG · WebP · GIF"}
      </p>

      {progress && progress.stage !== "idle" ? (
        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
          data-intro-upload-stage={progress.stage}
        >
          <div className="flex items-center gap-2">
            <AdminToneBadge
              tone={
                progress.stage === "ready"
                  ? "success"
                  : progress.stage === "failed"
                    ? "danger"
                    : progress.stage === "processing" ||
                        progress.stage === "confirming"
                      ? "progress"
                      : "waiting"
              }
            >
              {stageLabel(progress.stage, ko)}
            </AdminToneBadge>
            {progress.stage === "uploading" &&
            progress.transportPercent !== null ? (
              <span className="text-xs text-sam-muted">
                {progress.transportPercent}%
                <span className="ml-1 text-sam-muted">
                  ({ko ? "업로드 완료 ≠ 준비됨" : "upload complete ≠ ready"})
                </span>
              </span>
            ) : null}
          </div>
          {progress.stage === "uploading" &&
          progress.transportPercent !== null ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sam-surface-muted">
              <div
                className="h-full bg-sky-600 transition-[width]"
                style={{ width: `${progress.transportPercent}%` }}
              />
            </div>
          ) : null}
          {progress.stage === "processing" ? (
            <p className="mt-2 text-xs text-sam-muted">
              {ko
                ? "업로드는 끝났습니다. 서버가 런타임 미디어를 만들고 있습니다."
                : "Upload finished. Server is building the runtime artifact."}
            </p>
          ) : null}
          {progress.stage === "failed" ? (
            <p className="mt-2 text-sm text-red-800">
              {safeFailureMessage(
                progress.errorCategory,
                progress.errorMessage,
                ko,
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
