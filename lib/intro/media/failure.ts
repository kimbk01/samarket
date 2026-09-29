export const MediaFailureCategory = {
  AUTH_DENIED: "AUTH_DENIED",
  INVALID_STATE: "INVALID_STATE",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  MALFORMED_SOURCE: "MALFORMED_SOURCE",
  SOURCE_MISSING: "SOURCE_MISSING",
  SOURCE_INTEGRITY_MISMATCH: "SOURCE_INTEGRITY_MISMATCH",
  PROCESSOR_FAILED: "PROCESSOR_FAILED",
  PROCESSOR_HOST_BLOCKED: "PROCESSOR_HOST_BLOCKED",
  RUNTIME_WRITE_FAILED: "RUNTIME_WRITE_FAILED",
  RUNTIME_VERIFY_FAILED: "RUNTIME_VERIFY_FAILED",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  DELETE_BLOCKED_DRAFT_REF: "DELETE_BLOCKED_DRAFT_REF",
  NOT_FOUND: "NOT_FOUND",
  STORAGE_ERROR: "STORAGE_ERROR",
  SERVER_MISCONFIGURED: "SERVER_MISCONFIGURED",
} as const;

export type MediaFailureCategory =
  (typeof MediaFailureCategory)[keyof typeof MediaFailureCategory];

export class MediaPipelineError extends Error {
  readonly category: MediaFailureCategory;
  readonly safeMessage: string;

  constructor(category: MediaFailureCategory, safeMessage: string, cause?: unknown) {
    super(safeMessage);
    this.name = "MediaPipelineError";
    this.category = category;
    this.safeMessage = safeMessage;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

/** Operator-facing / browser-safe failure payload. Never includes stack/secrets. */
export function toClientFailure(err: unknown): {
  category: MediaFailureCategory;
  message: string;
} {
  if (err instanceof MediaPipelineError) {
    return { category: err.category, message: err.safeMessage };
  }
  return {
    category: MediaFailureCategory.PROCESSOR_FAILED,
    message: "Processing failed",
  };
}
