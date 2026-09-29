import type { AdminTone } from "@/components/admin/ui/AdminToneBadge";
import type { IntroMediaOperatorStatus } from "./types";

/** Map backend lifecycle → operator-visible status. READY only when backend says READY. */
export function toOperatorStatus(backendStatus: string): IntroMediaOperatorStatus {
  switch (backendStatus) {
    case "CREATED":
    case "UPLOADING":
      return "UPLOADING";
    case "UPLOADED":
    case "PROCESSING":
      return "PROCESSING";
    case "READY":
      return "READY";
    case "FAILED":
      return "FAILED";
    default:
      return "OTHER";
  }
}

export function operatorStatusLabel(
  status: IntroMediaOperatorStatus,
  ko: boolean,
): string {
  if (!ko) {
    switch (status) {
      case "UPLOADING":
        return "Uploading";
      case "PROCESSING":
        return "Processing";
      case "READY":
        return "Ready";
      case "FAILED":
        return "Failed";
      default:
        return "Pending";
    }
  }
  switch (status) {
    case "UPLOADING":
      return "업로드 중";
    case "PROCESSING":
      return "처리 중";
    case "READY":
      return "준비됨";
    case "FAILED":
      return "실패";
    default:
      return "대기";
  }
}

export function operatorStatusTone(status: IntroMediaOperatorStatus): AdminTone {
  switch (status) {
    case "UPLOADING":
      return "waiting";
    case "PROCESSING":
      return "progress";
    case "READY":
      return "success";
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

export function formatLabel(format: string | null, mime: string | null): string {
  if (format === "CANONICAL_ANIMATED_GIF") return "GIF";
  if (format) return format;
  if (!mime) return "—";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "JPEG";
  if (mime.includes("png")) return "PNG";
  if (mime.includes("webp")) return "WEBP";
  if (mime.includes("gif")) return "GIF";
  return mime;
}

export function safeFailureMessage(
  code: string | null,
  message: string | null,
  ko: boolean,
): string {
  const map: Record<string, { ko: string; en: string }> = {
    UNSUPPORTED_FORMAT: {
      ko: "지원하지 않는 파일 형식입니다. JPEG, PNG, WebP, GIF만 업로드할 수 있습니다.",
      en: "Unsupported format. Use JPEG, PNG, WebP, or GIF.",
    },
    MALFORMED_SOURCE: {
      ko: "파일을 읽을 수 없습니다. 손상되었거나 올바른 이미지가 아닙니다.",
      en: "Could not read the file. It may be damaged or not a valid image.",
    },
    PROCESSOR_FAILED: {
      ko: "미디어 처리에 실패했습니다. 다시 업로드해 주세요.",
      en: "Media processing failed. Please upload again.",
    },
    PROCESSOR_HOST_BLOCKED: {
      ko: "서버 처리기가 일시적으로 사용할 수 없습니다.",
      en: "Processor host is temporarily unavailable.",
    },
    UPLOAD_INCOMPLETE: {
      ko: "업로드가 완료되지 않았습니다.",
      en: "Upload did not complete.",
    },
    DELETE_BLOCKED_DRAFT_REF: {
      ko: "초안에서 사용 중인 미디어는 삭제할 수 없습니다.",
      en: "This media is used by a draft and cannot be deleted.",
    },
  };
  if (code && map[code]) return ko ? map[code].ko : map[code].en;
  if (message && message.length < 120 && !message.includes("at ")) {
    return message;
  }
  return ko
    ? "미디어를 준비하지 못했습니다. 다시 시도해 주세요."
    : "Could not prepare this media. Please try again.";
}
