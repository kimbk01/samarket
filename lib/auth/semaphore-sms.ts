import { requireSemaphoreSmsEnv } from "@/lib/env/semaphore-sms";

const SMS_SEND_FAILED_MESSAGE = "인증번호 발송에 실패했습니다.";

type SendSemaphoreSmsResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

type SemaphoreMessageRow = {
  status?: string;
  message_id?: string | number | null;
};

function isSemaphoreSendSuccess(payload: unknown): boolean {
  if (!Array.isArray(payload) || payload.length === 0) return false;
  const row = payload[0] as SemaphoreMessageRow;
  const status = String(row?.status ?? "").trim().toLowerCase();
  if (status === "failed" || status === "refunded") return false;
  const id = row?.message_id;
  return id != null && String(id).trim().length > 0;
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

export async function sendSemaphoreSms(number: string, message: string): Promise<SendSemaphoreSmsResult> {
  const env = requireSemaphoreSmsEnv();
  if (!env.ok) return { ok: false, error: env.error };

  const apiNumber = toSemaphoreApiNumber(number);
  if (!/^639\d{9}$/.test(apiNumber)) {
    return { ok: false, error: SMS_SEND_FAILED_MESSAGE };
  }

  const body = new URLSearchParams();
  body.set("apikey", env.apiKey);
  body.set("number", apiNumber);
  body.set("message", message);
  if (env.senderName) {
    body.set("sendername", env.senderName);
  }

  try {
    const res = await fetch(`${env.apiBaseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => null)) as unknown;
    if (!res.ok || !isSemaphoreSendSuccess(payload)) {
      return { ok: false, error: SMS_SEND_FAILED_MESSAGE };
    }
    const row = (payload as SemaphoreMessageRow[])[0];
    const messageId = row?.message_id != null ? String(row.message_id) : null;
    return { ok: true, providerMessageId: messageId };
  } catch {
    return { ok: false, error: SMS_SEND_FAILED_MESSAGE };
  }
}
