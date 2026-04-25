import { requireTwilioVerifyEnv } from "@/lib/env/twilio-verify";

type TwilioVerifyResult =
  | { ok: true; status: string }
  | { ok: false; error: string; status: number };

function buildAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function parseTwilioError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { message?: string } | null;
  return String(data?.message ?? "").trim() || fallback;
}

export async function sendTwilioVerificationCode(phone: string): Promise<TwilioVerifyResult> {
  const env = requireTwilioVerifyEnv();
  if (!env.ok) {
    return { ok: false, error: env.error, status: 503 };
  }
  const body = new URLSearchParams({
    To: phone,
    Channel: "sms",
  });
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(env.verifyServiceSid)}/Verifications`,
    {
      method: "POST",
      headers: {
        Authorization: buildAuthHeader(env.accountSid, env.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    }
  );
  if (!response.ok) {
    return {
      ok: false,
      error: await parseTwilioError(response, "인증번호 발송에 실패했습니다."),
      status: response.status,
    };
  }
  const data = (await response.json().catch(() => null)) as { status?: string } | null;
  return { ok: true, status: String(data?.status ?? "pending") };
}

export async function checkTwilioVerificationCode(phone: string, code: string): Promise<TwilioVerifyResult> {
  const env = requireTwilioVerifyEnv();
  if (!env.ok) {
    return { ok: false, error: env.error, status: 503 };
  }
  const body = new URLSearchParams({
    To: phone,
    Code: code,
  });
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(env.verifyServiceSid)}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        Authorization: buildAuthHeader(env.accountSid, env.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    }
  );
  if (!response.ok) {
    return {
      ok: false,
      error: await parseTwilioError(response, "인증번호 확인에 실패했습니다."),
      status: response.status,
    };
  }
  const data = (await response.json().catch(() => null)) as { status?: string } | null;
  return { ok: true, status: String(data?.status ?? "pending") };
}
