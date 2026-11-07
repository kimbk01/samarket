import "server-only";

import { createCipheriv, createDecipheriv, createHash, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sign in with Apple — 탈퇴 시 토큰 폐기 (App Store 계정 삭제 요구사항).
 * https://developer.apple.com/support/offering-account-deletion-in-your-app/
 *   「use the Sign in with Apple REST API to revoke user tokens」
 *
 * 1) 네이티브 Apple 로그인 성공 직후: authorizationCode → Apple `/auth/token` → refresh_token 을 암호화 저장.
 * 2) 탈퇴(회원 삭제) 처리 시: 저장된 refresh_token 으로 Apple `/auth/revoke` 호출 → 행 삭제.
 *
 * 키(.p8)·Key ID·Team ID 가 없으면 전부 건너뛴다 — 로그인·탈퇴 흐름은 절대 막지 않는다.
 */

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_AUDIENCE = "https://appleid.apple.com";
const TOKEN_TABLE = "apple_signin_tokens";
const REQUEST_TIMEOUT_MS = 8000;

export type AppleSiwaConfig = {
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  clientId: string;
};

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

function envTrim(name: string): string {
  return String(process.env[name] ?? "").trim();
}

/** .p8 를 env 한 줄로 넣을 때 `\n` 이스케이프를 허용 */
function normalizePem(raw: string): string {
  const s = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  return s.trim();
}

export function readAppleSiwaConfig(): AppleSiwaConfig | null {
  const teamId = envTrim("APPLE_SIWA_TEAM_ID");
  const keyId = envTrim("APPLE_SIWA_KEY_ID");
  const privateKeyPem = normalizePem(envTrim("APPLE_SIWA_KEY_P8"));
  const clientId =
    envTrim("APPLE_SIWA_CLIENT_ID") || envTrim("AUTH_APPLE_NATIVE_CLIENT_ID") || envTrim("APPLE_NATIVE_BUNDLE_ID");
  if (!teamId || !keyId || !privateKeyPem || !clientId) return null;
  return { teamId, keyId, privateKeyPem, clientId };
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Apple client_secret — ES256 JWT (iss=Team ID, sub=client_id, aud=appleid.apple.com, 5분) */
export function buildAppleClientSecret(config: AppleSiwaConfig, nowSec: number = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const payload = b64url(
    JSON.stringify({ iss: config.teamId, iat: nowSec, exp: nowSec + 300, aud: APPLE_AUDIENCE, sub: config.clientId })
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(config.privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64url(signature)}`;
}

/** 저장 암호화 키 — Apple 키(.p8)에서 파생 (테이블은 service role 전용, 추가 방어) */
function tokenKey(config: AppleSiwaConfig): Buffer {
  const ikm = createHash("sha256").update(config.privateKeyPem).digest();
  return Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(0), "dibay-siwa-refresh-token-v1", 32));
}

export function encryptAppleRefreshToken(config: AppleSiwaConfig, token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(config), iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${b64url(iv)}.${b64url(cipher.getAuthTag())}.${b64url(enc)}`;
}

export function decryptAppleRefreshToken(config: AppleSiwaConfig, stored: string): string | null {
  const parts = String(stored ?? "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", tokenKey(config), Buffer.from(parts[1], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

async function postForm(fetchImpl: FetchLike, url: string, form: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export type AppleTokenStoreResult =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "no_code" | "exchange_failed" | "no_refresh_token" | "save_failed" };

/** 네이티브 Apple 로그인 성공 직후 호출 — 실패해도 로그인에는 영향 없음 (결과만 돌려준다) */
export async function storeAppleSigninRefreshToken(
  sb: SupabaseClient,
  input: { userId: string; authorizationCode: string | null | undefined },
  deps: { config?: AppleSiwaConfig | null; fetchImpl?: FetchLike } = {}
): Promise<AppleTokenStoreResult> {
  const config = deps.config === undefined ? readAppleSiwaConfig() : deps.config;
  if (!config) return { ok: false, reason: "unconfigured" };
  const code = String(input.authorizationCode ?? "").trim();
  if (!code || !input.userId) return { ok: false, reason: "no_code" };
  const fetchImpl = deps.fetchImpl ?? (fetch as unknown as FetchLike);

  let refreshToken = "";
  try {
    const res = await postForm(fetchImpl, APPLE_TOKEN_URL, {
      client_id: config.clientId,
      client_secret: buildAppleClientSecret(config),
      code,
      grant_type: "authorization_code",
    });
    if (!res.ok) return { ok: false, reason: "exchange_failed" };
    const j = (await res.json()) as { refresh_token?: unknown };
    refreshToken = typeof j.refresh_token === "string" ? j.refresh_token : "";
  } catch {
    return { ok: false, reason: "exchange_failed" };
  }
  if (!refreshToken) return { ok: false, reason: "no_refresh_token" };

  const now = new Date().toISOString();
  const { error } = await sb.from(TOKEN_TABLE).upsert(
    {
      user_id: input.userId,
      client_id: config.clientId,
      refresh_token_enc: encryptAppleRefreshToken(config, refreshToken),
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  return error ? { ok: false, reason: "save_failed" } : { ok: true };
}

export type AppleTokenRevokeResult =
  | { status: "revoked" }
  | { status: "no_token" }
  | { status: "unconfigured" }
  | { status: "failed"; detail: string };

/** 탈퇴 처리 시 호출 — Apple 에 토큰 폐기 요청 후 저장 행 삭제. 실패는 기록용 결과로만 돌려준다. */
export async function revokeAppleSigninTokenForUser(
  sb: SupabaseClient,
  userId: string,
  deps: { config?: AppleSiwaConfig | null; fetchImpl?: FetchLike } = {}
): Promise<AppleTokenRevokeResult> {
  const { data, error } = await sb
    .from(TOKEN_TABLE)
    .select("refresh_token_enc, client_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { status: "failed", detail: "token_read_failed" };
  const row = data as { refresh_token_enc?: string; client_id?: string } | null;
  if (!row?.refresh_token_enc) return { status: "no_token" };

  const config = deps.config === undefined ? readAppleSiwaConfig() : deps.config;
  if (!config) return { status: "unconfigured" };
  const token = decryptAppleRefreshToken(config, row.refresh_token_enc);
  if (!token) return { status: "failed", detail: "token_decrypt_failed" };
  const fetchImpl = deps.fetchImpl ?? (fetch as unknown as FetchLike);
  const clientId = String(row.client_id ?? "").trim() || config.clientId;

  try {
    const res = await postForm(fetchImpl, APPLE_REVOKE_URL, {
      client_id: clientId,
      client_secret: buildAppleClientSecret({ ...config, clientId }),
      token,
      token_type_hint: "refresh_token",
    });
    if (!res.ok) return { status: "failed", detail: `apple_http_${res.status}` };
  } catch {
    return { status: "failed", detail: "apple_request_failed" };
  }
  await sb.from(TOKEN_TABLE).delete().eq("user_id", userId);
  return { status: "revoked" };
}
