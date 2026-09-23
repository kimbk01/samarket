import { describe, expect, it, vi } from "vitest";
import {
  APNS_TRANSPORT_MAX_ATTEMPTS,
  classifyApnsAttempt,
  runApnsHttp2WithBoundedTransportRetry,
  type ApnsPostOnceResult,
} from "@/lib/push/dispatch/apns-http2-transport";

describe("classifyApnsAttempt", () => {
  it("treats responseReceived as PROVIDER_RESPONSE (no transport retry)", () => {
    expect(
      classifyApnsAttempt({
        responseReceived: true,
        httpStatus: 400,
        status: "failed",
        errorMessage: JSON.stringify({ reason: "BadDeviceToken" }),
      })
    ).toEqual({ class: "PROVIDER_RESPONSE", retryable: false, retry_reason: null });

    expect(
      classifyApnsAttempt({
        responseReceived: true,
        httpStatus: 410,
        status: "failed",
        errorMessage: JSON.stringify({ reason: "Unregistered" }),
      })
    ).toEqual({ class: "PROVIDER_RESPONSE", retryable: false, retry_reason: null });

    expect(
      classifyApnsAttempt({
        responseReceived: true,
        httpStatus: 503,
        status: "failed",
        errorMessage: "unavailable",
      })
    ).toEqual({ class: "PROVIDER_RESPONSE", retryable: false, retry_reason: null });
  });

  it("classifies stream cancel before response as PRE_RESPONSE_TRANSIENT", () => {
    const c = classifyApnsAttempt({
      responseReceived: false,
      httpStatus: null,
      status: "failed",
      errorMessage: "The pending stream has been canceled (caused by: )",
    });
    expect(c.class).toBe("PRE_RESPONSE_TRANSIENT_TRANSPORT");
    expect(c.retryable).toBe(true);
    expect(c.retry_reason).toBe("http2_stream_cancel_before_response");
  });

  it("prefers structured error codes for transient transport", () => {
    const c = classifyApnsAttempt({
      responseReceived: false,
      httpStatus: null,
      status: "failed",
      errorCode: "ECONNRESET",
      errorMessage: "socket hang up",
    });
    expect(c.class).toBe("PRE_RESPONSE_TRANSIENT_TRANSPORT");
    expect(c.retryable).toBe(true);
    expect(c.retry_reason).toBe("error_code:ECONNRESET");
  });
});

describe("runApnsHttp2WithBoundedTransportRetry", () => {
  it("attempt1 stream cancel → attempt2 200 → final SENT", async () => {
    const posts: number[] = [];
    const result = await runApnsHttp2WithBoundedTransportRetry({
      channel: "voip",
      postOnce: async (attempt) => {
        posts.push(attempt);
        if (attempt === 1) {
          return {
            status: "failed",
            responseReceived: false,
            httpStatus: null,
            errorMessage: "The pending stream has been canceled (caused by: )",
          } satisfies ApnsPostOnceResult;
        }
        return {
          status: "sent",
          responseReceived: true,
          httpStatus: 200,
          provider_response: { provider: "voip_apns", kind: "ring", http_status: 200 },
        };
      },
    });
    expect(posts).toEqual([1, 2]);
    expect(result.status).toBe("sent");
    expect(result.provider_response?.attempt_count).toBe(2);
    expect(result.provider_response?.transport_retry_applied).toBe(true);
    expect(result.provider_response?.final_outcome).toBe("sent");
    expect(result.provider_response?.http_status).toBe(200);
    const attempts = result.provider_response?.attempts as Array<Record<string, unknown>>;
    expect(attempts).toHaveLength(2);
    expect(attempts[0].response_received).toBe(false);
    expect(attempts[1].response_received).toBe(true);
  });

  it("attempt1+2 stream cancel → final FAILED with exactly 2 attempts", async () => {
    const posts: number[] = [];
    const result = await runApnsHttp2WithBoundedTransportRetry({
      channel: "voip",
      postOnce: async (attempt) => {
        posts.push(attempt);
        return {
          status: "failed",
          responseReceived: false,
          httpStatus: null,
          errorMessage: "The pending stream has been canceled (caused by: )",
        };
      },
    });
    expect(posts).toEqual([1, 2]);
    expect(posts).toHaveLength(APNS_TRANSPORT_MAX_ATTEMPTS);
    expect(result.status).toBe("failed");
    expect(result.provider_response?.attempt_count).toBe(2);
    expect(result.provider_response?.final_outcome).toBe("failed");
  });

  it("attempt1 200 → no retry", async () => {
    const postOnce = vi.fn(async () => ({
      status: "sent" as const,
      responseReceived: true,
      httpStatus: 200,
      provider_response: { provider: "voip_apns", http_status: 200 },
    }));
    const result = await runApnsHttp2WithBoundedTransportRetry({
      channel: "voip",
      postOnce,
    });
    expect(postOnce).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("sent");
    expect(result.provider_response?.transport_retry_applied).toBe(false);
    expect(result.provider_response?.attempt_count).toBe(1);
  });

  it("semantic BadDeviceToken 400 → no transport retry", async () => {
    const postOnce = vi.fn(async () => ({
      status: "failed" as const,
      responseReceived: true,
      httpStatus: 400,
      errorMessage: JSON.stringify({ reason: "BadDeviceToken" }),
      provider_response: { provider: "voip_apns", http_status: 400, bad_device_token: true },
    }));
    const result = await runApnsHttp2WithBoundedTransportRetry({
      channel: "voip",
      postOnce,
    });
    expect(postOnce).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("failed");
    expect(result.provider_response?.transport_retry_applied).toBe(false);
  });

  it("Unregistered 410 → no transport retry", async () => {
    const postOnce = vi.fn(async () => ({
      status: "failed" as const,
      responseReceived: true,
      httpStatus: 410,
      errorMessage: JSON.stringify({ reason: "Unregistered" }),
      provider_response: { provider: "voip_apns", http_status: 410, bad_device_token: true },
    }));
    const result = await runApnsHttp2WithBoundedTransportRetry({
      channel: "alert",
      postOnce,
    });
    expect(postOnce).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("failed");
  });

  it("500/503 provider response → preserve no transport retry", async () => {
    const postOnce = vi.fn(async () => ({
      status: "failed" as const,
      responseReceived: true,
      httpStatus: 503,
      errorMessage: "Service Unavailable",
      provider_response: { provider: "apns", http_status: 503 },
    }));
    const result = await runApnsHttp2WithBoundedTransportRetry({
      channel: "alert",
      postOnce,
    });
    expect(postOnce).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("failed");
    expect(result.provider_response?.http_status).toBe(503);
  });

  it("same logical delivery identity across retry attempts", async () => {
    const result = await runApnsHttp2WithBoundedTransportRetry({
      channel: "voip",
      logContext: { callId: "91ae6915-4d15-4760-aaea-35493c5acb23" },
      postOnce: async (attempt) => {
        if (attempt === 1) {
          return {
            status: "failed",
            responseReceived: false,
            httpStatus: null,
            errorMessage: "The pending stream has been canceled (caused by: )",
          };
        }
        return {
          status: "sent",
          responseReceived: true,
          httpStatus: 200,
          provider_response: { provider: "voip_apns", http_status: 200 },
        };
      },
    });
    expect(result.provider_response?.attempt_count).toBe(2);
    expect(result.provider_response?.final_outcome).toBe("sent");
    // Single SendPushResult — one logical delivery outcome.
    expect(result.status).toBe("sent");
  });

  it("observability records attempt 1 + attempt 2 without secret fields", async () => {
    const result = await runApnsHttp2WithBoundedTransportRetry({
      channel: "voip",
      postOnce: async (attempt) => {
        if (attempt === 1) {
          return {
            status: "failed",
            responseReceived: false,
            httpStatus: null,
            errorMessage: "The pending stream has been canceled (caused by: )",
          };
        }
        return { status: "sent", responseReceived: true, httpStatus: 200 };
      },
    });
    const json = JSON.stringify(result.provider_response);
    expect(json).not.toMatch(/APNS_KEY|BEGIN PRIVATE|device_token|push_token/i);
    const attempts = result.provider_response?.attempts as Array<Record<string, unknown>>;
    expect(attempts.map((a) => a.attempt)).toEqual([1, 2]);
  });

  it("voice/video share the same repaired transport runner (channel only differs)", async () => {
    for (const channel of ["voip", "alert"] as const) {
      const result = await runApnsHttp2WithBoundedTransportRetry({
        channel,
        postOnce: async (attempt) => {
          if (attempt === 1) {
            return {
              status: "failed",
              responseReceived: false,
              httpStatus: null,
              errorMessage: "The pending stream has been canceled (caused by: )",
            };
          }
          return { status: "sent", responseReceived: true, httpStatus: 200 };
        },
      });
      expect(result.status).toBe("sent");
      expect(result.provider_response?.attempt_count).toBe(2);
    }
  });
});
