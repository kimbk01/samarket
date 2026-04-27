import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export const NAVER_OAUTH_STATE_COOKIE = "samarket_naver_oauth_state";

type NaverProfileResponse = {
  id: string;
  email: string;
  name: string;
  nickname: string;
  profileImage: string | null;
};

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromB64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function buildNaverState(next: string | null): string {
  const payload = {
    csrf: randomUUID().replace(/-/g, ""),
    next: next ?? "",
    ts: Date.now(),
  };
  return b64url(JSON.stringify(payload));
}

export function parseNaverState(state: string | null): { csrf: string; next: string | null } | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(fromB64url(state)) as { csrf?: unknown; next?: unknown; ts?: unknown };
    const csrf = typeof parsed.csrf === "string" ? parsed.csrf.trim() : "";
    const next = typeof parsed.next === "string" ? parsed.next.trim() : "";
    if (!csrf) return null;
    return { csrf, next: next || null };
  } catch {
    return null;
  }
}

export function buildNaverAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://nid.naver.com/oauth2.0/authorize");
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", args.state);
  return url.toString();
}

export async function requestNaverToken(args: {
  clientId: string;
  clientSecret: string;
  code: string;
  state: string;
}): Promise<{ accessToken: string }> {
  const tokenUrl = new URL("https://nid.naver.com/oauth2.0/token");
  tokenUrl.searchParams.set("grant_type", "authorization_code");
  tokenUrl.searchParams.set("client_id", args.clientId);
  tokenUrl.searchParams.set("client_secret", args.clientSecret);
  tokenUrl.searchParams.set("code", args.code);
  tokenUrl.searchParams.set("state", args.state);

  const res = await fetch(tokenUrl, { method: "POST", cache: "no-store" });
  const json = (await res.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null;
  if (!res.ok || !json?.access_token) {
    const detail = json?.error_description || json?.error || `token_http_${res.status}`;
    throw new Error(`naver_token_failed:${detail}`);
  }
  return { accessToken: json.access_token };
}

export async function fetchNaverProfile(accessToken: string): Promise<NaverProfileResponse> {
  const res = await fetch("https://openapi.naver.com/v1/nid/me", {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = (await res.json().catch(() => null)) as
    | {
        resultcode?: string;
        message?: string;
        response?: {
          id?: string;
          email?: string;
          name?: string;
          nickname?: string;
          profile_image?: string;
        };
      }
    | null;
  const body = json?.response;
  const id = String(body?.id ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!res.ok || !id || !email) {
    const detail = json?.message || `profile_http_${res.status}`;
    throw new Error(`naver_profile_failed:${detail}`);
  }
  return {
    id,
    email,
    name: String(body?.name ?? "").trim(),
    nickname: String(body?.nickname ?? "").trim(),
    profileImage: String(body?.profile_image ?? "").trim() || null,
  };
}

export function buildNaverSupabasePassword(email: string): string {
  const seed = process.env.NAVER_OAUTH_PASSWORD_SEED?.trim();
  if (!seed) {
    throw new Error("naver_password_seed_missing");
  }
  const digest = createHash("sha256").update(`${seed}:${email.toLowerCase()}`).digest("base64url");
  return `Nv#${digest.slice(0, 48)}!`;
}

export async function findAuthUserByEmail(
  adminSb: SupabaseClient,
  email: string
): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const perPage = 200;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminSb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message || "list_users_failed");
    const users = Array.isArray(data?.users) ? data.users : [];
    const hit = users.find((user) => String(user.email ?? "").trim().toLowerCase() === normalized);
    if (hit) return hit;
    if (users.length < perPage) break;
  }
  return null;
}
