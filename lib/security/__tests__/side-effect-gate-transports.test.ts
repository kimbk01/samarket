import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 실제 외부 호출 없이(전역 fetch 스텁) 전송 함수가 게이트에서 멈추는지 확인.
 * 비운영 + 운영 DB 형태의 env 로 실행한다.
 */
const PROD_URL = "https://ckdosyydvgzqwpbwuhon.supabase.co";

describe("전송 함수 — 비운영 + 운영 DB 이면 외부 호출 0", () => {
  const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
  beforeEach(() => {
    vi.resetModules();
    fetchSpy.mockClear();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("SIDE_EFFECT_GATE_ENFORCE_IN_TESTS", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROD_URL);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("Solapi 문자", async () => {
    vi.stubEnv("SOLAPI_API_KEY", "k");
    vi.stubEnv("SOLAPI_API_SECRET", "s");
    vi.stubEnv("SOLAPI_SENDER_NUMBER", "01000000000");
    const { sendSolapiSms } = await import("@/lib/auth/solapi-sms");
    const r = await sendSolapiSms("01012345678", "x");
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Semaphore 문자", async () => {
    vi.stubEnv("SEMAPHORE_API_KEY", "k");
    const { sendSemaphoreOtpSms } = await import("@/lib/auth/semaphore-sms");
    const r = await sendSemaphoreOtpSms("09171234567", "x {otp}", "123456");
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Resend 메일", async () => {
    vi.stubEnv("NOTIFICATION_EMAIL_ENABLED", "1");
    vi.stubEnv("RESEND_API_KEY", "k");
    const { trySendNotificationEmailResend } = await import("@/lib/notifications/send-notification-email-resend");
    await trySendNotificationEmailResend({} as never, {
      user_id: "u",
      notification_type: "commerce",
      title: "t",
    } as never);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("웹훅(일반·Slack·Discord)", async () => {
    vi.stubEnv("NOTIFICATION_WEBHOOK_URL", "https://hooks.example.com/x");
    vi.stubEnv("NOTIFICATION_SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/x");
    const { publishNotificationSideEffect } = await import("@/lib/notifications/publish-notification-side-effect");
    await publishNotificationSideEffect({ user_id: "u", notification_type: "system", title: "t" } as never, null);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Google Routes 는 비활성 경로로", async () => {
    vi.stubEnv("GOOGLE_ROUTES_API_DISABLED", "0");
    const { isGoogleRoutesApiGloballyDisabled } = await import("@/lib/geo/google-routes-client");
    expect(isGoogleRoutesApiGloballyDisabled()).toBe(true);
  });

  it("cron 은 503", async () => {
    const { rejectCronIfSideEffectsBlocked } = await import("@/lib/security/cron-side-effect-gate");
    const r = rejectCronIfSideEffectsBlocked();
    expect(r?.status).toBe(503);
  });
});

describe("전송 함수 — Production + 운영 DB 는 게이트 통과(운영 회귀 없음)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SIDE_EFFECT_GATE_ENFORCE_IN_TESTS", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROD_URL);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("대조군: 같은 웹훅·Solapi 호출이 Production 에서는 실제 fetch 까지 간다(위 차단 테스트가 헛통과가 아님)", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ messageList: [{ statusCode: "2000" }], groupInfo: { count: { total: 1, registeredFailed: 0 } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("NOTIFICATION_WEBHOOK_URL", "https://hooks.example.com/x");
    const { publishNotificationSideEffect } = await import("@/lib/notifications/publish-notification-side-effect");
    await publishNotificationSideEffect({ user_id: "u", notification_type: "system", title: "t" } as never, null);
    const afterWebhook = fetchSpy.mock.calls.length;
    vi.stubEnv("SOLAPI_API_KEY", "k");
    vi.stubEnv("SOLAPI_API_SECRET", "s");
    vi.stubEnv("SOLAPI_SENDER_NUMBER", "01000000000");
    const { sendSolapiSms } = await import("@/lib/auth/solapi-sms");
    await sendSolapiSms("01012345678", "x");
    vi.unstubAllGlobals();
    expect(afterWebhook).toBeGreaterThanOrEqual(1);
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(afterWebhook);
  });

  it("cron 게이트 null(통과)", async () => {
    const { rejectCronIfSideEffectsBlocked } = await import("@/lib/security/cron-side-effect-gate");
    expect(rejectCronIfSideEffectsBlocked()).toBeNull();
  });
  it("Google Routes 는 기존 env 규칙 그대로(0 이면 활성)", async () => {
    vi.stubEnv("GOOGLE_ROUTES_API_DISABLED", "0");
    const { isGoogleRoutesApiGloballyDisabled } = await import("@/lib/geo/google-routes-client");
    expect(isGoogleRoutesApiGloballyDisabled()).toBe(false);
  });
});
