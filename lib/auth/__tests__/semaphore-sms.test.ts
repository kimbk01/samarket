import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toSemaphoreApiNumber } from "@/lib/auth/semaphore-sms";

describe("toSemaphoreApiNumber", () => {
  it("converts 09 local format", () => {
    expect(toSemaphoreApiNumber("09171234567")).toBe("639171234567");
  });

  it("converts +63 E.164 format", () => {
    expect(toSemaphoreApiNumber("+639171234567")).toBe("639171234567");
  });

  it("keeps 639 format", () => {
    expect(toSemaphoreApiNumber("639171234567")).toBe("639171234567");
  });
});

describe("sendSemaphoreOtpSms — 인증번호 전용 경로 /otp (2026-11-10)", () => {
  const ok = (row: Record<string, unknown>) =>
    new Response(JSON.stringify([{ message_id: 1001, status: "Pending", ...row }]), { status: 200 });
  const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => ok({ code: "123456" }));

  beforeEach(() => {
    vi.resetModules();
    fetchSpy.mockClear();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("SEMAPHORE_API_KEY", "k");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("/otp 로 보내고 우리 번호를 code·otp 로 넘긴다 (문구는 {otp} 자리)", async () => {
    const { sendSemaphoreOtpSms } = await import("@/lib/auth/semaphore-sms");
    const r = await sendSemaphoreOtpSms("+639171234567", "[DIBAY] Verification code: {otp}", "123456");
    expect(r).toEqual({ ok: true, providerMessageId: "1001" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.semaphore.co/api/v4/otp");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("number")).toBe("639171234567");
    expect(body.get("message")).toBe("[DIBAY] Verification code: {otp}");
    expect(body.get("code")).toBe("123456");
    expect(body.get("otp")).toBe("123456");
  });

  it("응답 code 가 없어도 문구에 우리 번호가 있으면 성공", async () => {
    fetchSpy.mockResolvedValueOnce(ok({ message: "[DIBAY] Verification code: 123456" }));
    const { sendSemaphoreOtpSms } = await import("@/lib/auth/semaphore-sms");
    const r = await sendSemaphoreOtpSms("09171234567", "[DIBAY] Verification code: {otp}", "123456");
    expect(r.ok).toBe(true);
  });

  it("Semaphore 가 다른 번호를 보냈으면 실패 + 원인 기록", async () => {
    fetchSpy.mockResolvedValueOnce(ok({ code: "999999", message: "[DIBAY] Verification code: 999999" }));
    const { sendSemaphoreOtpSms } = await import("@/lib/auth/semaphore-sms");
    const r = await sendSemaphoreOtpSms("09171234567", "[DIBAY] Verification code: {otp}", "123456");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("code_mismatch message_id=1001");
  });

  it("status failed·HTTP 오류는 실패", async () => {
    const { sendSemaphoreOtpSms } = await import("@/lib/auth/semaphore-sms");
    fetchSpy.mockResolvedValueOnce(ok({ code: "123456", status: "Failed" }));
    expect((await sendSemaphoreOtpSms("09171234567", "x {otp}", "123456")).ok).toBe(false);
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const r = await sendSemaphoreOtpSms("09171234567", "x {otp}", "123456");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("HTTP 500");
  });

  it("{otp} 자리 없는 문구·6자리 아닌 번호는 보내지 않는다", async () => {
    const { sendSemaphoreOtpSms } = await import("@/lib/auth/semaphore-sms");
    expect((await sendSemaphoreOtpSms("09171234567", "no placeholder", "123456")).ok).toBe(false);
    expect((await sendSemaphoreOtpSms("09171234567", "x {otp}", "12345")).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
