import { requireSemaphoreSmsEnv } from "@/lib/env/semaphore-sms";

type SendSemaphoreSmsResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

type SemaphoreMessageRow = {
  message_id?: string | number | null;
  messageId?: string | number | null;
};

function pickProviderMessageId(payload: unknown): string | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0] as SemaphoreMessageRow;
  const raw = row?.message_id ?? row?.messageId ?? null;
  if (raw == null) return null;
  const value = String(raw).trim();
  return value.length > 0 ? value : null;
}

export async function sendSemaphoreSms(number: string, message: string): Promise<SendSemaphoreSmsResult> {
  const env = requireSemaphoreSmsEnv();
  if (!env.ok) return { ok: false, error: env.error };

  const body = new URLSearchParams();
  body.set("apikey", env.apiKey);
  body.set("number", number);
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
    if (!res.ok) {
      return { ok: false, error: "Semaphore SMS 발송에 실패했습니다." };
    }
    return { ok: true, providerMessageId: pickProviderMessageId(payload) };
  } catch {
    return { ok: false, error: "Semaphore SMS 발송 요청 중 오류가 발생했습니다." };
  }
}
