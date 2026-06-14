import type { ServiceAccount } from "firebase-admin/app";

export type FcmConfigSource = "base64_env" | "json_env" | "none";

export type FcmEnvDiagnostics = {
  source: FcmConfigSource;
  base64_env_length: number;
  json_env_length: number;
  base64_env_trimmed_length: number;
  json_env_trimmed_length: number;
  configured: boolean;
};

let cachedServiceAccount: ServiceAccount | null | undefined;

/** vitest — env stub 전후 캐시 초기화 */
export function resetFcmServiceAccountCacheForTests(): void {
  cachedServiceAccount = undefined;
}

/** Vercel runtime — secret 값 없이 env 존재·길이만 노출 */
export function getFcmEnvDiagnostics(): FcmEnvDiagnostics {
  const base64Raw = process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64 ?? "";
  const jsonRaw = process.env.FCM_SERVICE_ACCOUNT_JSON ?? "";
  const base64Trimmed = base64Raw.trim();
  const jsonTrimmed = jsonRaw.trim();
  const source = fcmConfigSource();
  return {
    source,
    base64_env_length: base64Raw.length,
    json_env_length: jsonRaw.length,
    base64_env_trimmed_length: base64Trimmed.length,
    json_env_trimmed_length: jsonTrimmed.length,
    configured: isFcmConfigured(),
  };
}

export function logFcmEnvDiagnostics(context?: string): FcmEnvDiagnostics {
  const diag = getFcmEnvDiagnostics();
  console.info("FCM_CONFIG_FOUND", {
    context: context ?? "fcm-env",
    source: diag.source,
    base64_env_length: diag.base64_env_length,
    json_env_length: diag.json_env_length,
    base64_env_trimmed_length: diag.base64_env_trimmed_length,
    json_env_trimmed_length: diag.json_env_trimmed_length,
    configured: diag.configured,
    vercel: process.env.VERCEL === "1",
  });
  if (diag.base64_env_trimmed_length === 0 && diag.json_env_trimmed_length === 0) {
    console.warn("FCM_CONFIG_FOUND env empty — FCM_SERVICE_ACCOUNT_JSON_BASE64 / FCM_SERVICE_ACCOUNT_JSON not set on runtime");
  }
  return diag;
}

/** FCM service account JSON — plain JSON, inline base64, or FCM_SERVICE_ACCOUNT_JSON_BASE64. */
export function readFcmServiceAccountJsonRaw(): string | null {
  const base64Env = process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (base64Env) {
    try {
      const decoded = Buffer.from(base64Env, "base64").toString("utf8");
      console.info("FCM_BASE64_DECODE_OK", {
        source: "FCM_SERVICE_ACCOUNT_JSON_BASE64",
        encoded_length: base64Env.length,
        decoded_length: decoded.length,
      });
      return decoded;
    } catch (e) {
      console.error("FCM_BASE64_DECODE_OK decode failed", {
        encoded_length: base64Env.length,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  if (raw.startsWith("{")) return raw;

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    console.info("FCM_BASE64_DECODE_OK", {
      source: "FCM_SERVICE_ACCOUNT_JSON",
      encoded_length: raw.length,
      decoded_length: decoded.length,
    });
    return decoded;
  } catch {
    return raw;
  }
}

export function parseFcmServiceAccount(): ServiceAccount | null {
  if (cachedServiceAccount !== undefined) return cachedServiceAccount;

  const raw = readFcmServiceAccountJsonRaw();
  if (!raw) {
    cachedServiceAccount = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") {
      console.error("FCM_JSON_PARSE_OK missing client_email or private_key", {
        has_client_email: typeof parsed.client_email === "string",
        has_private_key: typeof parsed.private_key === "string",
      });
      cachedServiceAccount = null;
      return null;
    }
    const emailPrefix = parsed.client_email.slice(0, Math.min(24, parsed.client_email.length));
    console.info("FCM_JSON_PARSE_OK", {
      client_email_prefix: emailPrefix,
      private_key_length: parsed.private_key.length,
      project_id: typeof parsed.project_id === "string" ? parsed.project_id : null,
    });
    cachedServiceAccount = parsed as ServiceAccount;
    return cachedServiceAccount;
  } catch (e) {
    console.error("FCM_JSON_PARSE_OK parse failed", {
      raw_length: raw.length,
      error: e instanceof Error ? e.message : String(e),
    });
    cachedServiceAccount = null;
    return null;
  }
}

export function isFcmConfigured(): boolean {
  return parseFcmServiceAccount() !== null;
}

export function fcmConfigSource(): FcmConfigSource {
  if (process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64?.trim()) return "base64_env";
  if (process.env.FCM_SERVICE_ACCOUNT_JSON?.trim()) return "json_env";
  return "none";
}
