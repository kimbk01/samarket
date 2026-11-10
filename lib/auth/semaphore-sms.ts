import { requireSemaphoreSmsEnv } from "@/lib/env/semaphore-sms";
import { checkSideEffectAllowed } from "@/lib/security/side-effect-gate";

const SMS_SEND_FAILED_MESSAGE = "인증번호 발송에 실패했습니다.";

type SendSemaphoreSmsResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

type SemaphoreMessageRow = {
  status?: string;
  message_id?: string | number | null;
  code?: string | number | null;
  message?: string | null;
};

/** 인증번호 문구 안에서 번호가 들어갈 자리 — Semaphore `/otp` 규칙. */
export const SEMAPHORE_OTP_PLACEHOLDER = "{otp}";

/**
 * `/otp` 응답 판정 — 접수(message_id) + 실패 상태 아님 + **회원이 받는 번호가 우리가 만든 번호와 같음**.
 * 응답 `code`(문서상 보낸 번호) 또는 응답 `message`(번호가 들어간 문구) 중 하나로 확인한다.
 * 둘 다 확인되지 않으면 Semaphore 가 번호를 따로 만들었을 수 있으므로 실패로 기록한다.
 */
export function judgeSemaphoreOtpResponse(
  payload: unknown,
  expectedCode: string,
): { ok: true; providerMessageId: string } | { ok: false; reason: string } {
  if (!Array.isArray(payload) || payload.length === 0) return { ok: false, reason: "unexpected_shape" };
  const row = payload[0] as SemaphoreMessageRow;
  const status = String(row?.status ?? "").trim().toLowerCase();
  if (status === "failed" || status === "refunded") return { ok: false, reason: `status_${status}` };
  const id = row?.message_id;
  if (id == null || String(id).trim().length === 0) return { ok: false, reason: "no_message_id" };
  const code = row?.code != null ? String(row.code).trim() : "";
  const message = typeof row?.message === "string" ? row.message : "";
  if (code !== expectedCode && !message.includes(expectedCode)) {
    return { ok: false, reason: `code_mismatch message_id=${String(id)}` };
  }
  return { ok: true, providerMessageId: String(id) };
}

/** Semaphore API number: 63917xxxxxxx (no + prefix). */
export function toSemaphoreApiNumber(input: string): string {
  const cleaned = String(input ?? "").replace(/[\s()-]/g, "").trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("+63")) return cleaned.slice(1);
  if (cleaned.startsWith("09")) return `63${cleaned.slice(1)}`;
  if (cleaned.startsWith("639")) return cleaned.replace(/[^\d]/g, "");
  const digits = cleaned.replace(/[^\d]/g, "");
  if (digits.startsWith("63")) return digits;
  if (digits.startsWith("9") && digits.length === 10) return `63${digits}`;
  return digits;
}

/**
 * 인증번호 문자 — Semaphore 인증번호 전용 경로 `POST /otp` (2026-11-10).
 * 일반 경로 `/messages` 는 기본 대기열이라 몰리면 늦어질 수 있다(Semaphore 문서). `/otp` 는 따로 있는 길, 1건(160자) 2크레딧.
 * 우리 번호를 쓰게 한다: 문서에 이름이 `code`·`otp` 두 가지로 적혀 있어 같은 값을 둘 다 보내고, 응답으로 일치를 확인한다.
 * 실패해도 일반 경로로 다시 보내지 않는다(같은 번호 두 번·비용 두 배 방지) — 실패는 발송 기록에 남는다.
 */
export async function sendSemaphoreOtpSms(
  number: string,
  messageTemplate: string,
  otpCode: string,
): Promise<SendSemaphoreSmsResult> {
  const env = requireSemaphoreSmsEnv();
  if (!env.ok) return { ok: false, error: env.error };
  // P0-A: 외부 호출 직전 서버 판정 — 비운영 환경에서 운영 문자 계정으로 실제 문자 발송 금지.
  const sideEffectGate = checkSideEffectAllowed("sms_semaphore");
  if (!sideEffectGate.allowed) {
    return { ok: false, error: `${SMS_SEND_FAILED_MESSAGE} (side_effect_blocked: ${sideEffectGate.reason})` };
  }

  const apiNumber = toSemaphoreApiNumber(number);
  if (!/^639\d{9}$/.test(apiNumber)) {
    return { ok: false, error: SMS_SEND_FAILED_MESSAGE };
  }
  if (!/^\d{6}$/.test(otpCode) || !messageTemplate.includes(SEMAPHORE_OTP_PLACEHOLDER)) {
    return { ok: false, error: `${SMS_SEND_FAILED_MESSAGE} (invalid_otp_request)` };
  }

  const body = new URLSearchParams();
  body.set("apikey", env.apiKey);
  body.set("number", apiNumber);
  body.set("message", messageTemplate);
  body.set("code", otpCode);
  body.set("otp", otpCode);
  if (env.senderName) {
    body.set("sendername", env.senderName);
  }

  try {
    const res = await fetch(`${env.apiBaseUrl}/otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      return { ok: false, error: `${SMS_SEND_FAILED_MESSAGE} (Semaphore HTTP ${res.status})` };
    }
    const judged = judgeSemaphoreOtpResponse(payload, otpCode);
    if (!judged.ok) {
      return { ok: false, error: `${SMS_SEND_FAILED_MESSAGE} (Semaphore ${judged.reason})` };
    }
    return { ok: true, providerMessageId: judged.providerMessageId };
  } catch {
    return { ok: false, error: SMS_SEND_FAILED_MESSAGE };
  }
}
