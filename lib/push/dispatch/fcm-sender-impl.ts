import type { App } from "firebase-admin/app";
import type { SendPushResult } from "@/lib/push/dispatch/push-payload-types";
import {
  fcmConfigSource,
  getFcmEnvDiagnostics,
  logFcmEnvDiagnostics,
  parseFcmServiceAccount,
} from "@/lib/push/dispatch/read-fcm-service-account";

let firebaseApp: App | null = null;
let firebaseAppPromise: Promise<App | null> | null = null;
let firebaseAppInitLogged = false;

/**
 * 첫 Vercel 요청에서 firebase-admin singleton 생성·로그.
 * admin test 등에서 dispatch 전에 호출 가능.
 */
export async function ensureFirebaseAdminApp(): Promise<App | null> {
  return getFirebaseApp();
}

export function isFirebaseAdminAppReady(): boolean {
  return firebaseApp !== null;
}

async function getFirebaseApp(): Promise<App | null> {
  if (firebaseApp) return firebaseApp;
  if (firebaseAppPromise) return firebaseAppPromise;

  firebaseAppPromise = (async () => {
    logFcmEnvDiagnostics("firebase-admin-init");

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
      const { initializeApp, cert, getApps } = await import("firebase-admin/app");
      const existing = getApps();
      if (existing.length > 0) {
        firebaseApp = existing[0]!;
        if (!firebaseAppInitLogged) {
          console.info("FCM_ADMIN_INITIALIZED", {
            mode: "reuse",
            app_name: firebaseApp.name,
            source: fcmConfigSource(),
          });
          firebaseAppInitLogged = true;
        }
        return firebaseApp;
      }

      firebaseApp = initializeApp({ credential: cert(credential) });
      console.info("FCM_ADMIN_INITIALIZED", {
        mode: "created",
        app_name: firebaseApp.name,
        source: fcmConfigSource(),
      });
      firebaseAppInitLogged = true;
      return firebaseApp;
    } catch (e) {
      console.error("FCM_ADMIN_INITIALIZED init failed", {
        source: fcmConfigSource(),
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    } finally {
      firebaseAppPromise = null;
    }
  })();

  return firebaseAppPromise;
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

export async function sendFcmMessageV1(input: {
  token: string;
  data: Record<string, unknown>;
  title: string;
  body: string;
  isCall: boolean;
}): Promise<SendPushResult> {
  const app = await getFirebaseApp();
  if (!app) {
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

  try {
    const { getMessaging } = await import("firebase-admin/messaging");
    const messaging = getMessaging(app);
    const dataPayload = stringifyData(input.data);
    const isTerminalDismiss =
      dataPayload.call_push_kind === "call_canceled" ||
      dataPayload.call_push_kind === "call_rejected" ||
      dataPayload.call_push_kind === "call_ended";

    /** Android: data-only → DibayFirebaseMessagingService.onMessageReceived (background/killed 포함). */
    const dataWithCopy = stringifyData({
      ...input.data,
      title: input.title,
      body: input.body,
    });

    if (isTerminalDismiss) {
      const messageId = await messaging.send({
        token: input.token,
        data: dataPayload,
        android: {
          priority: "high",
          ttl: 60_000,
        },
      });
      return {
        status: "sent",
        provider_response: {
          provider: "fcm",
          kind: "call_terminal_data",
          providerMessageId: messageId,
          message_id: messageId,
          priority: "high",
          ttlMs: 60_000,
          tokenPrefix: tokenPrefix(input.token),
          payloadType: dataPayload.call_push_kind,
          callId: dataPayload.callId ?? dataPayload.sessionId ?? null,
        },
      };
    }

    if (input.isCall) {
      const ttlMs = resolveTtlMs(dataPayload);
      const messageId = await messaging.send({
        token: input.token,
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
        android: {
          priority: "high",
          ttl: ttlMs,
        },
      });
      return {
        status: "sent",
        provider_response: {
          provider: "fcm",
          kind: "call_data_only",
          providerMessageId: messageId,
          message_id: messageId,
          priority: "high",
          ttlMs,
          tokenPrefix: tokenPrefix(input.token),
          payloadType: "incoming_call",
          callId: dataPayload.callId ?? dataPayload.sessionId ?? null,
        },
      };
    }

    const messageId = await messaging.send({
      token: input.token,
      data: dataWithCopy,
      android: {
        priority: "high",
      },
    });
    return {
      status: "sent",
      provider_response: { provider: "fcm", kind: "alert_data_only", message_id: messageId },
    };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const code = String(err?.code ?? "");
    const invalid =
      code.includes("registration-token-not-registered") ||
      code.includes("invalid-registration-token") ||
      code.includes("invalid-argument");
    return {
      status: "failed",
      error_message: err?.message ?? String(e),
      provider_response: { provider: "fcm", invalid_token: invalid, code: code || "unknown" },
    };
  }
}
