import http2 from "node:http2";
import crypto from "node:crypto";
import type { SendPushResult } from "@/lib/push/dispatch/push-payload-types";

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

async function apnsPost(
  path: string,
  body: unknown,
  topic: string,
  opts?: { pushType?: "alert" | "background"; priority?: "5" | "10" }
): Promise<SendPushResult> {
  const token = apnsJwt();
  if (!token) {
    return { status: "skipped", provider_response: { reason: "apns_not_configured" } };
  }

  const pushType = opts?.pushType ?? "alert";
  const priority = opts?.priority ?? "10";

  return await new Promise((resolve) => {
    const client = http2.connect(`https://${apnsHost()}`);
    const req = client.request({
      ":method": "POST",
      ":path": path,
      authorization: `bearer ${token}`,
      "apns-topic": topic,
      "apns-push-type": pushType,
      "apns-priority": priority,
      "content-type": "application/json",
    });

    let status = 0;
    let responseBody = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      if (status === 200) {
        resolve({
          status: "sent",
          provider_response: { provider: "apns", http_status: status, push_type: pushType },
        });
        return;
      }
      const badToken = status === 410 || status === 400;
      resolve({
        status: "failed",
        error_message: responseBody || `apns_http_${status}`,
        provider_response: {
          provider: "apns",
          http_status: status,
          bad_device_token: badToken,
          push_type: pushType,
        },
      });
    });
    req.on("error", (e) => {
      client.close();
      resolve({ status: "failed", error_message: e.message, provider_response: { provider: "apns" } });
    });
    req.write(JSON.stringify(body));
    req.end();
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

function resolveApnsCallPushKind(data: Record<string, unknown>): string | null {
  const raw = data.call_push_kind ?? data.type;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** Silent/background wake for CallKit dismiss — no new user-facing alert. */
function isSilentTerminalDismissKind(kind: string | null): boolean {
  return kind === "call_canceled" || kind === "call_rejected" || kind === "call_ended";
}

function isMissedTerminalKind(kind: string | null): boolean {
  return kind === "missed_call";
}

export function buildApnsAlertBody(input: {
  title: string;
  body: string;
  data: Record<string, unknown>;
}): Record<string, unknown> {
  const kind = resolveApnsCallPushKind(input.data);

  // cancel/reject/ended — wake app for CallKit dismiss without a new banner (policy §3).
  if (isSilentTerminalDismissKind(kind)) {
    return {
      aps: {
        "content-available": 1,
      },
      ...input.data,
      call_push_kind: kind,
      ...(typeof input.data.occurred_at === "string"
        ? {}
        : typeof input.data.occurredAt === "string"
          ? { occurred_at: input.data.occurredAt }
          : {}),
    };
  }

  const aps: Record<string, unknown> = {
    alert: { title: input.title, body: input.body },
    sound: "default",
  };
  // missed — visible history alert + content-available so CallKit can dismiss in parallel.
  if (isMissedTerminalKind(kind)) {
    aps["content-available"] = 1;
  }
  const badge = apnsBadgeCount(input.data);
  if (badge != null) aps.badge = badge;
  const category = apnsCategory(input.data);
  if (category) aps.category = category;
  return {
    aps,
    ...input.data,
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

  const kind = resolveApnsCallPushKind(input.data);
  const silentTerminal = isSilentTerminalDismissKind(kind);
  const body = buildApnsAlertBody(input);

  return apnsPost(`/3/device/${token}`, body, topic, {
    pushType: silentTerminal ? "background" : "alert",
    priority: silentTerminal ? "5" : "10",
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

  const isCancel = input.callPushKind === "call_canceled";

  return await new Promise((resolve) => {
    const jwt = apnsJwt();
    if (!jwt) {
      resolve({ status: "skipped", provider_response: { reason: "apns_not_configured" } });
      return;
    }

    const client = http2.connect(`https://${apnsHost()}`);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "voip",
      "apns-priority": "10",
      "apns-expiration": "0",
      "content-type": "application/json",
    });

    let status = 0;
    let responseBody = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      if (status === 200) {
        resolve({
          status: "sent",
          provider_response: { provider: "voip_apns", kind: isCancel ? "cancel" : "ring", http_status: status },
        });
        return;
      }
      resolve({
        status: "failed",
        error_message: responseBody || `voip_http_${status}`,
        provider_response: {
          provider: "voip_apns",
          http_status: status,
          bad_device_token: status === 410 || status === 400,
        },
      });
    });
    req.on("error", (e) => {
      client.close();
      resolve({ status: "failed", error_message: e.message, provider_response: { provider: "voip_apns" } });
    });
    req.write(JSON.stringify({ ...input.data, call_push_kind: input.callPushKind ?? "incoming_call" }));
    req.end();
  });
}
