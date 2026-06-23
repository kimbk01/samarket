import type { FcmServiceAccountCredential } from "@/lib/push/dispatch/fcm-service-account-types";

export type FcmConfigSource = "split_env" | "json_env" | "base64_env" | "none";

export type FcmEnvDiagnostics = {
  source: FcmConfigSource;
  has_project_id: boolean;
  has_client_email: boolean;
  private_key_length: number;
  configured: boolean;
};

let cachedServiceAccount: FcmServiceAccountCredential | null | undefined;

/** vitest — env stub 전후 캐시 초기화 */
export function resetFcmServiceAccountCacheForTests(): void {
  cachedServiceAccount = undefined;
}

function readSplitEnvServiceAccount(): FcmServiceAccountCredential | null {
  const projectId = process.env.FCM_PROJECT_ID?.trim() ?? "";
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim() ?? "";
  const privateKeyRaw = process.env.FCM_PRIVATE_KEY?.trim() ?? "";
  if (!projectId && !clientEmail && !privateKeyRaw) return null;
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function normalizeServiceAccountJson(parsed: Record<string, unknown>): FcmServiceAccountCredential | null {
  const projectId =
    typeof parsed.project_id === "string"
      ? parsed.project_id
      : typeof parsed.projectId === "string"
        ? parsed.projectId
        : "";
  const clientEmail =
    typeof parsed.client_email === "string"
      ? parsed.client_email
      : typeof parsed.clientEmail === "string"
        ? parsed.clientEmail
        : "";
  const privateKeyRaw =
    typeof parsed.private_key === "string"
      ? parsed.private_key
      : typeof parsed.privateKey === "string"
        ? parsed.privateKey
        : "";
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

/** Vercel runtime — secret 값 없이 env 존재·길이만 노출 */
export function getFcmEnvDiagnostics(): FcmEnvDiagnostics {
  const parsed = parseFcmServiceAccount();
  const source = fcmConfigSource();
  const splitPrivateKey = (process.env.FCM_PRIVATE_KEY?.trim() ?? "").replace(/\\n/g, "\n");
  return {
    source,
    has_project_id: Boolean(parsed?.projectId ?? process.env.FCM_PROJECT_ID?.trim()),
    has_client_email: Boolean(parsed?.clientEmail ?? process.env.FCM_CLIENT_EMAIL?.trim()),
    private_key_length: parsed?.privateKey?.length ?? splitPrivateKey.length,
    configured: parsed !== null,
  };
}

export function logFcmEnvDiagnostics(context?: string): FcmEnvDiagnostics {
  const diag = getFcmEnvDiagnostics();
  console.info("FCM_CONFIG_FOUND", {
    context: context ?? "fcm-env",
    source: diag.source,
    has_project_id: diag.has_project_id,
    has_client_email: diag.has_client_email,
    private_key_length: diag.private_key_length,
    configured: diag.configured,
    vercel: process.env.VERCEL === "1",
  });
  if (diag.source === "none") {
    console.warn("FCM_CONFIG_FOUND env empty — FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY not set on runtime");
  }
  return diag;
}

/** FCM service account JSON — plain JSON, inline base64, or FCM_SERVICE_ACCOUNT_JSON_BASE64. */
export function readFcmServiceAccountJsonRaw(): string | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
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

  const base64Env = process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (!base64Env) return null;
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

export function parseFcmServiceAccount(): FcmServiceAccountCredential | null {
  if (cachedServiceAccount !== undefined) return cachedServiceAccount;

  const splitEnv = readSplitEnvServiceAccount();
  if (splitEnv) {
    console.info("FCM_JSON_PARSE_OK", {
      source: "split_env",
      has_project_id: true,
      has_client_email: true,
      private_key_length: splitEnv.privateKey?.length ?? 0,
    });
    cachedServiceAccount = splitEnv;
    return cachedServiceAccount;
  }

  const raw = readFcmServiceAccountJsonRaw();
  if (!raw) {
    cachedServiceAccount = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized = normalizeServiceAccountJson(parsed);
    if (!normalized) {
      console.error("FCM_JSON_PARSE_OK missing client_email or private_key", {
        has_client_email: typeof parsed.client_email === "string",
        has_private_key: typeof parsed.private_key === "string",
      });
      cachedServiceAccount = null;
      return null;
    }
    console.info("FCM_JSON_PARSE_OK", {
      source: fcmConfigSource(),
      has_project_id: Boolean(normalized.projectId),
      has_client_email: Boolean(normalized.clientEmail),
      private_key_length: normalized.privateKey?.length ?? 0,
    });
    cachedServiceAccount = normalized;
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
  if (
    process.env.FCM_PROJECT_ID?.trim() ||
    process.env.FCM_CLIENT_EMAIL?.trim() ||
    process.env.FCM_PRIVATE_KEY?.trim()
  ) {
    return "split_env";
  }
  if (process.env.FCM_SERVICE_ACCOUNT_JSON?.trim()) return "json_env";
  if (process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64?.trim()) return "base64_env";
  return "none";
}
