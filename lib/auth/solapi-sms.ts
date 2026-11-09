import { createHmac, randomBytes } from "node:crypto";
import { requireSolapiSmsEnv } from "@/lib/env/solapi-sms";
import { checkSideEffectAllowed } from "@/lib/security/side-effect-gate";

/** 발송 기록(error_summary) 전용 — 회원 화면 문구는 phone-otp-client-errors 카탈로그 */
const SMS_SEND_FAILED_MESSAGE = "SMS send failed";

type SendSolapiSmsResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

const SALT_ALPHABET = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Solapi 공식 SDK(solapi@6.1.0 getAuthInfo)와 같은 서명: HMAC-SHA256(secret, date + salt) hex. */
export function buildSolapiAuthorization(apiKey: string, apiSecret: string, now: Date = new Date()): string {
  const bytes = randomBytes(32);
  let salt = "";
  for (let i = 0; i < 32; i++) salt += SALT_ALPHABET[bytes[i]! % SALT_ALPHABET.length];
  // date-fns formatISO 처럼 초 단위 ISO 8601 (밀리초 없음)
  const date = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const signature = createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

type SolapiSendResponse = {
  failedMessageList?: Array<{ statusCode?: string; statusMessage?: string }>;
  groupInfo?: { count?: { total?: number; registeredFailed?: number } };
  messageList?: Array<{ messageId?: string; statusCode?: string }>;
  errorCode?: string;
  errorMessage?: string;
};

/**
 * 한국 휴대폰(+82) 인증 문자 발송. `to` = 국내 표기 `010…`.
 * 접수 실패(failedMessageList·HTTP 오류)는 실패로 돌려 회원에게 「발송 실패」를 보인다.
 */
export async function sendSolapiSms(toKoreaLocal: string, text: string): Promise<SendSolapiSmsResult> {
  const env = requireSolapiSmsEnv();
  if (!env.ok) return { ok: false, error: SMS_SEND_FAILED_MESSAGE };
  // P0-A: 외부 호출 직전 서버 판정 — 비운영 환경에서 운영 문자 계정으로 실제 문자 발송 금지.
  const sideEffectGate = checkSideEffectAllowed("sms_solapi");
  if (!sideEffectGate.allowed) {
    return { ok: false, error: `${SMS_SEND_FAILED_MESSAGE} (side_effect_blocked: ${sideEffectGate.reason})`.slice(0, 480) };
  }
  const to = String(toKoreaLocal ?? "").replace(/\D/g, "");
  if (!/^01[016789]\d{7,8}$/.test(to)) return { ok: false, error: SMS_SEND_FAILED_MESSAGE };

  try {
    const res = await fetch(`${env.apiBaseUrl.replace(/\/$/, "")}/messages/v4/send-many/fast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildSolapiAuthorization(env.apiKey, env.apiSecret),
      },
      body: JSON.stringify({
        messages: [{ to, from: env.senderNumber, text, country: "82" }],
        showMessageList: true,
      }),
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => null)) as SolapiSendResponse | null;
    if (!res.ok || !payload) {
      // 어드민 운영 화면 기록용 — Solapi 오류 코드·원문 그대로 (예: Forbidden 사유)
      const detail = [payload?.errorCode ?? `HTTP ${res.status}`, payload?.errorMessage].filter(Boolean).join(": ");
      return { ok: false, error: `${SMS_SEND_FAILED_MESSAGE} (Solapi ${detail})`.slice(0, 480) };
    }
    const failed = payload.failedMessageList ?? [];
    if (failed.length > 0) {
      const f = failed[0];
      return { ok: false, error: `${SMS_SEND_FAILED_MESSAGE} (${f?.statusCode ?? "failed"} ${f?.statusMessage ?? ""})`.trim() };
    }
    const messageId = payload.messageList?.[0]?.messageId ?? null;
    return { ok: true, providerMessageId: messageId };
  } catch {
    return { ok: false, error: SMS_SEND_FAILED_MESSAGE };
  }
}
