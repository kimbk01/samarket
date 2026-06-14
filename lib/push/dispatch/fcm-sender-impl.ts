import type { App, ServiceAccount } from "firebase-admin/app";
import type { SendPushResult } from "@/lib/push/dispatch/push-payload-types";

let firebaseApp: App | null = null;
let firebaseAppPromise: Promise<App | null> | null = null;

async function getFirebaseApp(): Promise<App | null> {
  if (firebaseApp) return firebaseApp;
  if (firebaseAppPromise) return firebaseAppPromise;

  firebaseAppPromise = (async () => {
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
    if (!raw) return null;
    try {
      const credential = JSON.parse(raw) as Record<string, unknown>;
      const { initializeApp, cert, getApps } = await import("firebase-admin/app");
      const existing = getApps();
      if (existing.length > 0) {
        firebaseApp = existing[0]!;
        return firebaseApp;
      }
      firebaseApp = initializeApp({
        credential: cert(credential as ServiceAccount),
      });
      return firebaseApp;
    } catch (e) {
      console.error("[fcm-sender-impl] init", e);
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
    return { status: "skipped", provider_response: { reason: "fcm_not_configured" } };
  }

  try {
    const { getMessaging } = await import("firebase-admin/messaging");
    const messaging = getMessaging(app);
    const dataPayload = stringifyData(input.data);
    const isCancel = dataPayload.call_push_kind === "call_canceled";

    if (input.isCall && isCancel) {
      await messaging.send({
        token: input.token,
        data: dataPayload,
        android: {
          priority: "high",
        },
      });
      return { status: "sent", provider_response: { provider: "fcm", kind: "call_cancel_data" } };
    }

    if (input.isCall) {
      await messaging.send({
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
      return { status: "sent", provider_response: { provider: "fcm", kind: "call_high_priority" } };
    }

    await messaging.send({
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
    return { status: "sent", provider_response: { provider: "fcm", kind: "alert" } };
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
      provider_response: { provider: "fcm", invalid_token: invalid, code },
    };
  }
}
