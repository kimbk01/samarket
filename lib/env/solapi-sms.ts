/**
 * Solapi (한국 +82 인증 문자) 환경 변수 — Vercel Production 에 Owner 가 등록.
 *   SOLAPI_API_KEY · SOLAPI_API_SECRET · SOLAPI_SENDER_NUMBER (Solapi 콘솔에 등록·인증된 발신번호, 숫자만)
 * 셋 중 하나라도 없으면 한국 번호 인증을 화면에 내놓지 않는다(`isSolapiSmsConfigured`).
 */
type SolapiSmsEnv =
  | { ok: true; apiKey: string; apiSecret: string; senderNumber: string; apiBaseUrl: string }
  | { ok: false; missing: string[] };

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function requireSolapiSmsEnv(): SolapiSmsEnv {
  const apiKey = readEnv("SOLAPI_API_KEY");
  const apiSecret = readEnv("SOLAPI_API_SECRET");
  const senderNumber = (readEnv("SOLAPI_SENDER_NUMBER") ?? "").replace(/\D/g, "");
  const missing = [
    !apiKey ? "SOLAPI_API_KEY" : "",
    !apiSecret ? "SOLAPI_API_SECRET" : "",
    !senderNumber ? "SOLAPI_SENDER_NUMBER" : "",
  ].filter(Boolean);
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    apiKey: apiKey as string,
    apiSecret: apiSecret as string,
    senderNumber,
    apiBaseUrl: readEnv("SOLAPI_API_BASE_URL") ?? "https://api.solapi.com",
  };
}

export function isSolapiSmsConfigured(): boolean {
  return requireSolapiSmsEnv().ok;
}
