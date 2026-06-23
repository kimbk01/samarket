import type { SendPushResult } from "@/lib/push/dispatch/push-payload-types";
import { sendFcmHttpV1Message } from "@/lib/push/dispatch/fcm-http-v1-client";
import {
  fcmConfigSource,
  getFcmEnvDiagnostics,
  logFcmEnvDiagnostics,
  parseFcmServiceAccount,
} from "@/lib/push/dispatch/read-fcm-service-account";

export type FcmDispatchHandle = { projectId: string };

let fcmHttpReady: FcmDispatchHandle | null = null;
let fcmHttpWarmPromise: Promise<FcmDispatchHandle | null> | null = null;
let fcmHttpInitLogged = false;

/** admin test 등 — OAuth 토큰·자격 증명 warm-up (firebase-admin 없음) */
export async function ensureFirebaseAdminApp(): Promise<FcmDispatchHandle | null> {
  return warmFcmHttpClient();
}

export function isFirebaseAdminAppReady(): boolean {
  return fcmHttpReady !== null;
}

async function warmFcmHttpClient(): Promise<FcmDispatchHandle | null> {
  if (fcmHttpReady) return fcmHttpReady;
  if (fcmHttpWarmPromise) return fcmHttpWarmPromise;

  fcmHttpWarmPromise = (async () => {
    logFcmEnvDiagnostics("fcm-http-v1-init");

    const credential = parseFcmServiceAccount();
    if (!credential) {
      const diag = getFcmEnvDiagnostics();
      console.warn("[fcm-sender-impl] init skipped — fcm_not_configured", {
        source: fcmConfigSource(),
        has_project_id: diag.has_project_id,
        has_client_email: diag.has_client_email,
        private_key_length: diag.private_key_length,
      });
      return null;
    }

    try {
      const { getFcmAccessToken } = await import("@/lib/push/dispatch/fcm-http-v1-client");
      await getFcmAccessToken(credential);
      fcmHttpReady = { projectId: credential.projectId };
      if (!fcmHttpInitLogged) {
        console.info("FCM_HTTP_V1_INITIALIZED", {
          project_id: credential.projectId,
          source: fcmConfigSource(),
        });
        fcmHttpInitLogged = true;
      }
      return fcmHttpReady;
    } catch (e) {
      console.error("FCM_HTTP_V1_INITIALIZED init failed", {
        source: fcmConfigSource(),
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    } finally {
      fcmHttpWarmPromise = null;
    }
  })();

  return fcmHttpWarmPromise;
}

function stringifyData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

function tokenPrefix(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

function resolveTtlMs(data: Record<string, string>): number {
  const raw = Number(data.ttlMs ?? data.ttl_ms);
  if (Number.isFinite(raw) && raw >= 60_000 && raw <= 120_000) return Math.trunc(raw);
  return 60_000;
}

function ttlMsToDuration(ms: number): string {
  return `${Math.max(1, Math.trunc(ms / 1000))}s`;
}

function fcmHttpFailureProviderResponse(result: Extract<Awaited<ReturnType<typeof sendFcmHttpV1Message>>, { ok: false }>) {
  return {
    provider: "fcm" as const,
    invalid_token: result.invalidToken,
    code: result.code,
    http_status: result.status,
    http_body: result.body,
  };
}

function fcmApiPriority(priority: "high" | "normal"): "HIGH" | "NORMAL" {
  return priority === "high" ? "HIGH" : "NORMAL";
}

export function resolveAndroidPriorityForData(data: Record<string, string>): "high" | "normal" {
  const type = String(data.type ?? "").trim();
  const category = String(data.category ?? "").trim();
  const callKind = String(data.call_push_kind ?? "").trim();
  if (
    callKind === "incoming_call" ||
    callKind === "missed_call" ||
    callKind === "call_canceled" ||
    callKind === "call_rejected" ||
    callKind === "call_ended"
  ) {
    return "high";
  }
  if (category === "admin_marketing_banner") return "normal";
  if (type === "chat_message" || type === "group_message" || type === "trade_message") return "high";
  if (type === "order_status" || type === "delivery_order" || type === "delivery_status") return "high";
  if (type === "trade_status") return "high";
  return "normal";
}

export async function sendFcmMessageV1(input: {
  token: string;
  data: Record<string, unknown>;
  title: string;
  body: string;
  isCall: boolean;
}): Promise<SendPushResult> {
  const ready = await warmFcmHttpClient();
  const credential = parseFcmServiceAccount();
  if (!ready || !credential) {
    const diag = getFcmEnvDiagnostics();
    return {
      status: "skipped",
      provider_response: {
        reason: "fcm_not_configured",
        source: fcmConfigSource(),
        has_project_id: diag.has_project_id,
        has_client_email: diag.has_client_email,
        private_key_length: diag.private_key_length,
      },
    };
  }

  const dataPayload = stringifyData(input.data);
  const isTerminalDismiss =
    dataPayload.call_push_kind === "call_canceled" ||
    dataPayload.call_push_kind === "call_rejected" ||
    dataPayload.call_push_kind === "call_ended";

  const dataWithCopy = stringifyData({
    ...input.data,
    title: input.title,
    body: input.body,
  });

  try {
    if (isTerminalDismiss) {
      const ttlMs = 60_000;
      const result = await sendFcmHttpV1Message({
        account: credential,
        deviceToken: input.token,
        data: dataPayload,
        android: { priority: "HIGH", ttl: ttlMsToDuration(ttlMs) },
      });
      if (!result.ok) {
        return {
          status: "failed",
          error_message: result.message,
          provider_response: fcmHttpFailureProviderResponse(result),
        };
      }
      return {
        status: "sent",
        provider_response: {
          provider: "fcm",
          kind: "call_terminal_data",
          providerMessageId: result.messageName,
          message_id: result.messageName,
          priority: "high",
          ttlMs,
          tokenPrefix: tokenPrefix(input.token),
          payloadType: dataPayload.call_push_kind,
          callId: dataPayload.callId ?? dataPayload.sessionId ?? null,
        },
      };
    }

    if (input.isCall) {
      const ttlMs = resolveTtlMs(dataPayload);
      const result = await sendFcmHttpV1Message({
        account: credential,
        deviceToken: input.token,
        data: stringifyData({
          ...input.data,
          type: "incoming_call",
          action: "incoming_call",
          dibay_call: "1",
          call_push_kind: "incoming_call",
          priority: "high",
          ttlMs,
          title: input.title,
          body: input.body,
        }),
        android: { priority: "HIGH", ttl: ttlMsToDuration(ttlMs) },
      });
      if (!result.ok) {
        return {
          status: "failed",
          error_message: result.message,
          provider_response: fcmHttpFailureProviderResponse(result),
        };
      }
      return {
        status: "sent",
        provider_response: {
          provider: "fcm",
          kind: "call_data_only",
          providerMessageId: result.messageName,
          message_id: result.messageName,
          priority: "high",
          ttlMs,
          tokenPrefix: tokenPrefix(input.token),
          payloadType: "incoming_call",
          callId: dataPayload.callId ?? dataPayload.sessionId ?? null,
        },
      };
    }

    const priority = resolveAndroidPriorityForData(dataWithCopy);
    const result = await sendFcmHttpV1Message({
      account: credential,
      deviceToken: input.token,
      data: dataWithCopy,
      android: { priority: fcmApiPriority(priority) },
    });
    if (!result.ok) {
      return {
        status: "failed",
        error_message: result.message,
        provider_response: fcmHttpFailureProviderResponse(result),
      };
    }
    return {
      status: "sent",
      provider_response: {
        provider: "fcm",
        kind: "alert_data_only",
        message_id: result.messageName,
        priority,
      },
    };
  } catch (e: unknown) {
    const err = e as { message?: string };
    return {
      status: "failed",
      error_message: err?.message ?? String(e),
      provider_response: { provider: "fcm", code: "unknown" },
    };
  }
}
