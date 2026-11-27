type SemaphoreSmsEnv =
  | {
      ok: true;
      apiKey: string;
      senderName: string | null;
      apiBaseUrl: string;
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

export function resolveSemaphoreSenderName(): string {
  return readEnv("SEMAPHORE_SENDER_NAME") || readEnv("SEMAPHORE_SENDER") || "DIBAY";
}

export function requireSemaphoreSmsEnv(): SemaphoreSmsEnv {
  const apiKey = readEnv("SEMAPHORE_API_KEY");
  const senderName = resolveSemaphoreSenderName();
  const apiBaseUrl = readEnv("SEMAPHORE_API_BASE_URL") ?? "https://api.semaphore.co/api/v4";
  const missing = [!apiKey ? "SEMAPHORE_API_KEY" : ""].filter(Boolean);
  if (missing.length > 0) {
    return {
      ok: false,
      error: "sms_send_failed",
      missing,
    };
  }
  return {
    ok: true,
    apiKey: apiKey as string,
    senderName,
    apiBaseUrl,
  };
}
