import http2 from "node:http2";
import crypto from "node:crypto";
import type { SendPushResult } from "@/lib/push/dispatch/push-payload-types";
import {
  runApnsHttp2WithBoundedTransportRetry,
  type ApnsPostOnceResult,
} from "@/lib/push/dispatch/apns-http2-transport";

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function apnsJwt(): string | null {
  const key = process.env.APNS_KEY_P8?.replace(/\\n/g, "\n").trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  if (!key || !keyId || !teamId) return null;

  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64Url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const unsigned = `${header}.${payload}`;
  const sig = crypto.sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${base64Url(sig)}`;
}

function apnsHost(): string {
  return process.env.APNS_PRODUCTION === "1" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
}

function apnsTopic(): string | null {
  return process.env.APNS_BUNDLE_ID?.trim() || process.env.APNS_VOIP_TOPIC?.trim() || null;
}

type ApnsHttp2RequestInput = {
  path: string;
  body: unknown;
  topic: string;
  pushType: "alert" | "voip";
  channel: "alert" | "voip";
  /** Extra provider_response fields merged on success/fail after transport wrap. */
  successExtras?: Record<string, unknown>;
};

/**
 * One HTTP/2 POST on a fresh APNs connection.
 * Never reuses a session that may already be GOAWAY/closed.
 */
function apnsHttp2PostOnce(input: ApnsHttp2RequestInput): Promise<ApnsPostOnceResult> {
  const token = apnsJwt();
  if (!token) {
    return Promise.resolve({
      status: "skipped",
      responseReceived: false,
      httpStatus: null,
      errorMessage: "apns_not_configured",
      provider_response: { reason: "apns_not_configured" },
    });
  }

  return new Promise((resolve) => {
    const client = http2.connect(`https://${apnsHost()}`);
    let settled = false;
    let responseReceived = false;
    let status = 0;
    let responseBody = "";

    const finish = (result: ApnsPostOnceResult) => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    client.on("error", (e: NodeJS.ErrnoException) => {
      finish({
        status: "failed",
        responseReceived,
        httpStatus: responseReceived ? status || null : null,
        errorMessage: e.message,
        errorCode: typeof e.code === "string" ? e.code : null,
        provider_response: { provider: input.channel === "voip" ? "voip_apns" : "apns" },
      });
    });

    const headers: http2.OutgoingHttpHeaders = {
      ":method": "POST",
      ":path": input.path,
      authorization: `bearer ${token}`,
      "apns-topic": input.topic,
      "apns-push-type": input.pushType,
      "apns-priority": "10",
      "content-type": "application/json",
    };
    if (input.pushType === "voip") {
      headers["apns-expiration"] = "0";
    }

    const req = client.request(headers);
    req.on("response", (resHeaders) => {
      responseReceived = true;
      status = Number(resHeaders[":status"] ?? 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      if (!responseReceived) {
        finish({
          status: "failed",
          responseReceived: false,
          httpStatus: null,
          errorMessage: "apns_stream_ended_without_response",
          provider_response: { provider: input.channel === "voip" ? "voip_apns" : "apns" },
        });
        return;
      }
      if (status === 200) {
        finish({
          status: "sent",
          responseReceived: true,
          httpStatus: 200,
          provider_response: {
            provider: input.channel === "voip" ? "voip_apns" : "apns",
            http_status: 200,
            ...(input.successExtras ?? {}),
          },
        });
        return;
      }
      const badToken = status === 410 || status === 400;
      finish({
        status: "failed",
        responseReceived: true,
        httpStatus: status,
        errorMessage: responseBody || `apns_http_${status}`,
        provider_response: {
          provider: input.channel === "voip" ? "voip_apns" : "apns",
          http_status: status,
          bad_device_token: badToken,
        },
      });
    });
    req.on("error", (e: NodeJS.ErrnoException) => {
      finish({
        status: "failed",
        responseReceived,
        httpStatus: responseReceived ? status || null : null,
        errorMessage: e.message,
        errorCode: typeof e.code === "string" ? e.code : null,
        provider_response: { provider: input.channel === "voip" ? "voip_apns" : "apns" },
      });
    });
    req.write(JSON.stringify(input.body));
    req.end();
  });
}

async function apnsPostWithTransportRetry(input: ApnsHttp2RequestInput): Promise<SendPushResult> {
  return runApnsHttp2WithBoundedTransportRetry({
    channel: input.channel,
    postOnce: async () => apnsHttp2PostOnce(input),
  });
}

function apnsBadgeCount(data: Record<string, unknown>): number | null {
  const raw = Number(data.badgeCount ?? data.badge_count);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.trunc(raw));
}

function apnsCategory(data: Record<string, unknown>): string | null {
  const raw = data.category ?? data.type;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function apnsPushImageUrl(data: Record<string, unknown>): string | null {
  const raw = data.imageUrl ?? data.image_url ?? data.bigPictureUrl ?? data.big_picture_url;
  return typeof raw === "string" && raw.trim().startsWith("https://") ? raw.trim() : null;
}

export function buildApnsAlertBody(input: {
  title: string;
  body: string;
  data: Record<string, unknown>;
}): Record<string, unknown> {
  const aps: Record<string, unknown> = {
    alert: { title: input.title, body: input.body },
    sound: "default",
  };
  const badge = apnsBadgeCount(input.data);
  if (badge != null) aps.badge = badge;
  const category = apnsCategory(input.data);
  if (category) aps.category = category;
  const imageUrl = apnsPushImageUrl(input.data);
  if (imageUrl) {
    aps["mutable-content"] = 1;
  }
  return {
    aps,
    ...input.data,
    ...(imageUrl ? { imageUrl, push_image_url: imageUrl } : {}),
  };
}

export async function sendApnsAlertImpl(input: {
  deviceToken: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}): Promise<SendPushResult> {
  const topic = apnsTopic();
  if (!topic) {
    return { status: "skipped", provider_response: { reason: "apns_topic_missing" } };
  }
  const token = input.deviceToken.trim();
  if (!token) return { status: "failed", error_message: "empty_device_token" };

  return apnsPostWithTransportRetry({
    path: `/3/device/${token}`,
    body: buildApnsAlertBody(input),
    topic,
    pushType: "alert",
    channel: "alert",
  });
}

export async function sendVoipApnsImpl(input: {
  deviceToken: string;
  data: Record<string, unknown>;
  callPushKind: string | null;
}): Promise<SendPushResult> {
  const topic = process.env.APNS_VOIP_TOPIC?.trim() || (apnsTopic() ? `${apnsTopic()}.voip` : null);
  if (!topic) {
    return { status: "skipped", provider_response: { reason: "voip_topic_missing" } };
  }

  const token = input.deviceToken.trim();
  if (!token) return { status: "failed", error_message: "empty_voip_token" };

  // CONTRACT: VoIP payload must carry an explicit call kind. Never default to incoming_call
  // (that made admin/notice pushes ring CallKit as a fake incoming call).
  const callPushKind = typeof input.callPushKind === "string" ? input.callPushKind.trim() : "";
  if (!callPushKind) {
    return { status: "skipped", provider_response: { reason: "voip_requires_call_push_kind" } };
  }

  const isCancel = callPushKind === "call_canceled";

  return apnsPostWithTransportRetry({
    path: `/3/device/${token}`,
    body: { ...input.data, call_push_kind: callPushKind },
    topic,
    pushType: "voip",
    channel: "voip",
    successExtras: { kind: isCancel ? "cancel" : "ring" },
  });
}
