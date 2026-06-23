import crypto from "node:crypto";
import type { FcmServiceAccountCredential } from "@/lib/push/dispatch/fcm-service-account-types";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

function base64url(value: Buffer | string): string {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buf.toString("base64url");
}

function signServiceAccountJwt(account: FcmServiceAccountCredential): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: account.clientEmail,
    sub: account.clientEmail,
    aud: OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
    scope: FCM_SCOPE,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), account.privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

export async function getFcmAccessToken(account: FcmServiceAccountCredential): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > now + 60_000) {
    return cachedAccessToken.token;
  }

  const assertion = signServiceAccountJwt(account);
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`FCM oauth token failed: ${res.status} ${bodyText.slice(0, 300)}`);
  }

  const json = JSON.parse(bodyText) as { access_token?: string; expires_in?: number };
  const token = String(json.access_token ?? "").trim();
  if (!token) throw new Error("FCM oauth token missing access_token");

  const expiresIn = Number(json.expires_in ?? 3600);
  cachedAccessToken = { token, expiresAtMs: now + Math.max(60, expiresIn) * 1000 };
  return token;
}

export function resetFcmAccessTokenCacheForTests(): void {
  cachedAccessToken = null;
}

export type FcmHttpV1AndroidConfig = {
  priority: "HIGH" | "NORMAL";
  ttl?: string;
};

export type FcmHttpV1SendInput = {
  account: FcmServiceAccountCredential;
  deviceToken: string;
  data: Record<string, string>;
  android?: FcmHttpV1AndroidConfig;
};

export type FcmHttpV1SendResult =
  | { ok: true; messageName: string }
  | { ok: false; status: number; code: string; message: string; body: string; invalidToken: boolean };

export async function sendFcmHttpV1Message(input: FcmHttpV1SendInput): Promise<FcmHttpV1SendResult> {
  const accessToken = await getFcmAccessToken(input.account);
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(input.account.projectId)}/messages:send`;

  const fcmMessage: Record<string, unknown> = {
    token: input.deviceToken,
    data: input.data,
  };
  if (input.android) {
    fcmMessage.android = {
      priority: input.android.priority,
      ...(input.android.ttl ? { ttl: input.android.ttl } : {}),
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: fcmMessage }),
  });

  const bodyText = await res.text();
  if (res.ok) {
    const json = JSON.parse(bodyText) as { name?: string };
    const messageName = String(json.name ?? "").trim();
    if (!messageName) {
      return {
        ok: false,
        status: res.status,
        code: "empty_name",
        message: "FCM response missing name",
        body: bodyText.slice(0, 2000),
        invalidToken: false,
      };
    }
    return { ok: true, messageName };
  }

  let code = "unknown";
  let errorMessage = bodyText.slice(0, 500);
  try {
    const err = JSON.parse(bodyText) as { error?: { status?: string; message?: string } };
    code = String(err.error?.status ?? code);
    errorMessage = String(err.error?.message ?? errorMessage);
  } catch {
    /* raw body */
  }

  const lower = `${code} ${errorMessage}`.toLowerCase();
  const invalidToken =
    code === "NOT_FOUND" ||
    code === "INVALID_ARGUMENT" ||
    lower.includes("registration-token-not-registered") ||
    lower.includes("not a valid fcm registration token") ||
    lower.includes("invalid registration");

  return { ok: false, status: res.status, code, message: errorMessage, body: bodyText.slice(0, 2000), invalidToken };
}
