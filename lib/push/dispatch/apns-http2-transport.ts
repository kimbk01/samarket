/**
 * CUT-6C-R1 — APNs HTTP/2 transport classification + bounded retry.
 *
 * Retry ONLY when no APNs HTTP response was observed and the failure is
 * classified as PRE_RESPONSE_TRANSIENT_TRANSPORT.
 *
 * Max attempts = 2 (initial + one retry). Fresh connection per attempt
 * (caller creates a new http2 client each postOnce).
 */
import type { DeliveryStatus, SendPushResult } from "@/lib/push/dispatch/push-payload-types";

export const APNS_TRANSPORT_MAX_ATTEMPTS = 2;

export type ApnsTransportFailureClass =
  | "PRE_RESPONSE_TRANSIENT_TRANSPORT"
  | "PROVIDER_RESPONSE"
  | "LOCAL_PERMANENT_ERROR";

export type ApnsAttemptObservation = {
  attempt: number;
  response_received: boolean;
  http_status: number | null;
  provider_reason?: string | null;
  transport_error_code?: string | null;
  transport_error_message?: string | null;
  transport_class?: ApnsTransportFailureClass | null;
  retryable: boolean;
  retry_reason?: string | null;
  outcome: DeliveryStatus;
};

export type ApnsPostOnceResult = {
  status: DeliveryStatus;
  /** True iff HTTP/2 `:status` headers arrived for this attempt. */
  responseReceived: boolean;
  httpStatus: number | null;
  errorMessage?: string | null;
  /** Structured Node error.code when present (e.g. ECONNRESET). */
  errorCode?: string | null;
  provider_response?: Record<string, unknown> | null;
};

/**
 * Structured classification — prefer responseReceived over message substrings.
 */
export function classifyApnsAttempt(input: {
  responseReceived: boolean;
  httpStatus: number | null;
  status: DeliveryStatus;
  errorMessage?: string | null;
  errorCode?: string | null;
}): {
  class: ApnsTransportFailureClass;
  retryable: boolean;
  retry_reason: string | null;
} {
  if (input.status === "skipped") {
    return { class: "LOCAL_PERMANENT_ERROR", retryable: false, retry_reason: null };
  }

  if (input.responseReceived) {
    return { class: "PROVIDER_RESPONSE", retryable: false, retry_reason: null };
  }

  // No APNs HTTP response observed.
  if (input.status === "sent") {
    return { class: "LOCAL_PERMANENT_ERROR", retryable: false, retry_reason: null };
  }

  const code = String(input.errorCode ?? "").trim();
  const msg = String(input.errorMessage ?? "").toLowerCase();

  if (
    /empty_.*token|apns_not_configured|topic_missing|voip_requires_call_push_kind/.test(
      String(input.errorMessage ?? "")
    )
  ) {
    return { class: "LOCAL_PERMANENT_ERROR", retryable: false, retry_reason: null };
  }

  const transientCodes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EPIPE",
    "ENOTFOUND",
    "ERR_HTTP2_STREAM_ERROR",
    "ERR_HTTP2_SESSION_ERROR",
    "ERR_HTTP2_STREAM_CANCEL",
    "ERR_HTTP2_INVALID_SESSION",
    "ERR_SSL_WRONG_VERSION_NUMBER",
  ]);
  if (code && transientCodes.has(code)) {
    return {
      class: "PRE_RESPONSE_TRANSIENT_TRANSPORT",
      retryable: true,
      retry_reason: `error_code:${code}`,
    };
  }

  if (
    msg.includes("pending stream has been canceled") ||
    msg.includes("stream closed") ||
    msg.includes("goaway") ||
    msg.length > 0 ||
    code
  ) {
    return {
      class: "PRE_RESPONSE_TRANSIENT_TRANSPORT",
      retryable: true,
      retry_reason: code
        ? `error_code:${code}`
        : msg.includes("pending stream has been canceled")
          ? "http2_stream_cancel_before_response"
          : "pre_response_transport_failure",
    };
  }

  return {
    class: "PRE_RESPONSE_TRANSIENT_TRANSPORT",
    retryable: true,
    retry_reason: "pre_response_unknown",
  };
}

export async function runApnsHttp2WithBoundedTransportRetry(input: {
  channel: "voip" | "alert";
  postOnce: (attempt: number) => Promise<ApnsPostOnceResult>;
  maxAttempts?: number;
  logContext?: Record<string, unknown>;
}): Promise<SendPushResult> {
  const maxAttempts = Math.max(
    1,
    Math.min(input.maxAttempts ?? APNS_TRANSPORT_MAX_ATTEMPTS, APNS_TRANSPORT_MAX_ATTEMPTS)
  );
  const attempts: ApnsAttemptObservation[] = [];
  let last: ApnsPostOnceResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const once = await input.postOnce(attempt);
    last = once;
    const classified = classifyApnsAttempt({
      responseReceived: once.responseReceived,
      httpStatus: once.httpStatus,
      status: once.status,
      errorMessage: once.errorMessage,
      errorCode: once.errorCode,
    });

    const observation: ApnsAttemptObservation = {
      attempt,
      response_received: once.responseReceived,
      http_status: once.httpStatus,
      provider_reason: once.responseReceived
        ? once.errorMessage ?? (once.httpStatus === 200 ? null : `http_${once.httpStatus}`)
        : null,
      transport_error_code: once.errorCode ?? null,
      transport_error_message: once.responseReceived ? null : once.errorMessage ?? null,
      transport_class: once.status === "sent" ? null : classified.class,
      retryable: classified.retryable && attempt < maxAttempts,
      retry_reason: classified.retryable && attempt < maxAttempts ? classified.retry_reason : null,
      outcome: once.status,
    };
    attempts.push(observation);

    console.info("[APNS_HTTP2_TRANSPORT]", {
      channel: input.channel,
      ...input.logContext,
      attempt,
      response_received: observation.response_received,
      http_status: observation.http_status,
      transport_class: observation.transport_class,
      retryable: observation.retryable,
      retry_reason: observation.retry_reason,
      outcome: observation.outcome,
    });

    if (once.status === "sent" || once.status === "skipped") {
      return finalize(once, attempts, input.channel);
    }

    if (!classified.retryable || attempt >= maxAttempts) {
      return finalize(once, attempts, input.channel);
    }
  }

  return finalize(
    last ?? {
      status: "failed",
      responseReceived: false,
      httpStatus: null,
      errorMessage: "apns_transport_exhausted",
    },
    attempts,
    input.channel
  );
}

function finalize(
  last: ApnsPostOnceResult,
  attempts: ApnsAttemptObservation[],
  channel: "voip" | "alert"
): SendPushResult {
  const provider = channel === "voip" ? "voip_apns" : "apns";
  const base = (
    last.provider_response && typeof last.provider_response === "object"
      ? { ...last.provider_response }
      : {}
  ) as Record<string, unknown>;

  const retried = attempts.length > 1;
  return {
    status: last.status,
    error_message: last.status === "failed" ? last.errorMessage ?? null : null,
    provider_response: {
      ...base,
      provider: base.provider ?? provider,
      http_status: last.httpStatus,
      attempt_count: attempts.length,
      attempts,
      ...(retried
        ? {
            transport_retry_applied: true,
            transport_retry_reason: attempts[0]?.retry_reason ?? "PRE_RESPONSE_TRANSIENT_TRANSPORT",
          }
        : { transport_retry_applied: false }),
      final_outcome: last.status,
    },
  };
}
