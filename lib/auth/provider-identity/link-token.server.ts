import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { LinkableAuthProvider, ProviderIdentityCandidate } from "@/lib/auth/provider-identity/types";

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
/** secret 미설정 시 발급되는 검증 불가 stash (fail-closed). */
const CONFLICT_STASH_UNAVAILABLE = "stash_unavailable";

type PendingLinkPayload = {
  kind: "provider_link";
  userId: string;
  provider: LinkableAuthProvider;
  candidate: ProviderIdentityCandidate;
  exp: number;
};

type ConflictStashPayload = {
  kind: "conflict_stash";
  candidate: ProviderIdentityCandidate;
  /** P1-4 — conflict 대상 회원 바인딩. 원본 UUID 대신 HMAC (stash 는 클라이언트가 디코드 가능). */
  boundUserHash: string;
  exp: number;
  nonce: string;
};

/** 토큰 종류별 HMAC 키 분리 (같은 secret · 다른 context label). */
type LinkTokenKeyContext = "provider_link_token.v2" | "conflict_stash_token.v2" | "conflict_stash_bound_user.v2";

/**
 * OA-13 — 하드코딩 fallback 제거. AUTH_PROVIDER_LINK_TOKEN_SECRET → SUPABASE_SERVICE_ROLE_KEY.
 * 둘 다 없으면 fail-closed (토큰 발급·검증 모두 불가).
 */
function linkTokenRootSecret(): string | null {
  const explicit = process.env.AUTH_PROVIDER_LINK_TOKEN_SECRET?.trim();
  if (explicit) return explicit;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return service || null;
}

function deriveKey(context: LinkTokenKeyContext): Buffer {
  const root = linkTokenRootSecret();
  if (!root) throw new Error("provider_link_token_secret_missing");
  return createHmac("sha256", root).update(`dibay:${context}`).digest();
}

function sign(context: LinkTokenKeyContext, encoded: string): string {
  return createHmac("sha256", deriveKey(context)).update(encoded).digest("base64url");
}

function hashBoundUserId(userId: string): string {
  return createHmac("sha256", deriveKey("conflict_stash_bound_user.v2"))
    .update(userId.trim())
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function encodeSigned(context: LinkTokenKeyContext, payload: unknown): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(context, encoded)}`;
}

function decodeSigned<T>(context: LinkTokenKeyContext, token: string): T | null {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  let expectedSig: string;
  try {
    expectedSig = sign(context, encoded);
  } catch {
    return null;
  }
  if (!safeEqual(sig, expectedSig)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function createProviderLinkToken(
  userId: string,
  candidate: ProviderIdentityCandidate,
): { linkToken: string; expiresAt: string } {
  const exp = Date.now() + LINK_TOKEN_TTL_MS;
  const payload: PendingLinkPayload = {
    kind: "provider_link",
    userId,
    provider: candidate.provider,
    candidate,
    exp,
  };
  return { linkToken: encodeSigned("provider_link_token.v2", payload), expiresAt: new Date(exp).toISOString() };
}

export function verifyProviderLinkToken(
  linkToken: string,
  expectedUserId: string,
): PendingLinkPayload | null {
  const payload = decodeSigned<PendingLinkPayload>("provider_link_token.v2", linkToken);
  if (!payload || payload.kind !== "provider_link") return null;
  if (!payload.userId || !payload.provider || !payload.candidate) return null;
  if (payload.userId !== expectedUserId) return null;
  if (!(Date.now() <= payload.exp)) return null;
  return payload;
}

/**
 * P1-4 — conflict stash 는 conflict 대상 회원(`boundUserId` = 기존 회원 user id)에 묶인다.
 * 바인딩 없는 stash 는 발급하지 않는다(빈 문자열 → 검증 단계에서 항상 거부).
 */
export function createConflictStashToken(
  candidate: ProviderIdentityCandidate,
  boundUserId?: string | null,
): string {
  if (!linkTokenRootSecret()) {
    // fail-closed: 검증 불가 토큰 — conflict 안내 UX 는 유지하되 연결에는 쓸 수 없다.
    console.error("[auth/link-token]", JSON.stringify({ event: "provider_link_token_secret_missing" }));
    return CONFLICT_STASH_UNAVAILABLE;
  }
  const bound = String(boundUserId ?? "").trim();
  const payload: ConflictStashPayload = {
    kind: "conflict_stash",
    candidate,
    boundUserHash: bound ? hashBoundUserId(bound) : "",
    exp: Date.now() + LINK_TOKEN_TTL_MS,
    nonce: randomBytes(16).toString("hex"),
  };
  return encodeSigned("conflict_stash_token.v2", payload);
}

/**
 * stash 검증 — 서명·만료·종류 + **현재 세션 회원 == conflict 대상 회원**.
 * 다른 계정 세션에서 제출된 stash(URL 주입 포함)는 null.
 */
export function verifyConflictStashToken(
  token: string,
  sessionUserId: string,
): ProviderIdentityCandidate | null {
  const payload = decodeSigned<ConflictStashPayload>("conflict_stash_token.v2", token);
  if (!payload || payload.kind !== "conflict_stash" || !payload.candidate) return null;
  if (!(Date.now() <= payload.exp)) return null;
  const sessionUser = String(sessionUserId ?? "").trim();
  if (!payload.boundUserHash || !sessionUser) return null;
  let expected: string;
  try {
    expected = hashBoundUserId(sessionUser);
  } catch {
    return null;
  }
  if (!safeEqual(payload.boundUserHash, expected)) return null;
  return payload.candidate;
}
