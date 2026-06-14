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

async function apnsPost(path: string, body: unknown, topic: string): Promise<SendPushResult> {
  const token = apnsJwt();
  if (!token) {
    return { status: "skipped", provider_response: { reason: "apns_not_configured" } };
  }

  return await new Promise((resolve) => {
    const client = http2.connect(`https://${apnsHost()}`);
    const req = client.request({
      ":method": "POST",
      ":path": path,
      authorization: `bearer ${token}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
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
        resolve({ status: "sent", provider_response: { provider: "apns", http_status: status } });
        return;
      }
      const badToken = status === 410 || status === 400;
      resolve({
        status: "failed",
        error_message: responseBody || `apns_http_${status}`,
        provider_response: { provider: "apns", http_status: status, bad_device_token: badToken },
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

  return apnsPost(
    `/3/device/${token}`,
    {
      aps: {
        alert: { title: input.title, body: input.body },
        sound: "default",
      },
      ...input.data,
    },
    topic
  );
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
