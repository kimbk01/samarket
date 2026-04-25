type TwilioVerifyEnv =
  | {
      ok: true;
      accountSid: string;
      authToken: string;
      verifyServiceSid: string;
    }
  | {
      ok: false;
      error: string;
      missing: string[];
    };

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function requireTwilioVerifyEnv(): TwilioVerifyEnv {
  const accountSid = readEnv("TWILIO_ACCOUNT_SID");
  const authToken = readEnv("TWILIO_AUTH_TOKEN");
  const verifyServiceSid = readEnv("TWILIO_VERIFY_SERVICE_SID");
  const missing = [
    !accountSid ? "TWILIO_ACCOUNT_SID" : "",
    !authToken ? "TWILIO_AUTH_TOKEN" : "",
    !verifyServiceSid ? "TWILIO_VERIFY_SERVICE_SID" : "",
  ].filter(Boolean);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `필수 환경변수 누락: ${missing.join(", ")}`,
      missing,
    };
  }
  return {
    ok: true,
    accountSid: accountSid as string,
    authToken: authToken as string,
    verifyServiceSid: verifyServiceSid as string,
  };
}
