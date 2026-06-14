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
        base64_env_trimmed_length: diag.base64_env_trimmed_length,
        json_env_trimmed_length: diag.json_env_trimmed_length,
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
        base64_env_trimmed_length: diag.base64_env_trimmed_length,
        json_env_trimmed_length: diag.json_env_trimmed_length,
      },
    };
  }

  try {
    const { getMessaging } = await import("firebase-admin/messaging");
    const messaging = getMessaging(app);
    const dataPayload = stringifyData(input.data);
    const isCancel = dataPayload.call_push_kind === "call_canceled";

    if (input.isCall && isCancel) {
      const messageId = await messaging.send({
        token: input.token,
        data: dataPayload,
        android: {
          priority: "high",
        },
      });
      return {
        status: "sent",
        provider_response: { provider: "fcm", kind: "call_cancel_data", message_id: messageId },
      };
    }

    if (input.isCall) {
      const messageId = await messaging.send({
        token: input.token,
        data: {
          ...dataPayload,
          dibay_call: "1",
        },
        android: {
          priority: "high",
          ttl: 60_000,
          notification: {
            title: input.title,
            body: input.body,
            channelId: "dibay_calls",
            priority: "max" as const,
            visibility: "public" as const,
          },
        },
      });
      return {
        status: "sent",
        provider_response: { provider: "fcm", kind: "call_high_priority", message_id: messageId },
      };
    }

    const messageId = await messaging.send({
      token: input.token,
      notification: {
        title: input.title,
        body: input.body,
      },
      data: dataPayload,
      android: {
        priority: "high",
        notification: {
          channelId: "dibay_messages",
        },
      },
    });
    return {
      status: "sent",
      provider_response: { provider: "fcm", kind: "alert", message_id: messageId },
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
