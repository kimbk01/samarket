import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { LinkableAuthProvider, ProviderIdentityCandidate } from "@/lib/auth/provider-identity/types";

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;

type PendingLinkPayload = {
  userId: string;
  provider: LinkableAuthProvider;
  candidate: ProviderIdentityCandidate;
  exp: number;
};

function linkTokenSecret(): string {
  return (
    process.env.AUTH_PROVIDER_LINK_TOKEN_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "dibay-dev-provider-link-secret"
  );
}

function signPayload(encoded: string): string {
  return createHmac("sha256", linkTokenSecret()).update(encoded).digest("base64url");
}

export function createProviderLinkToken(
  userId: string,
  candidate: ProviderIdentityCandidate,
): { linkToken: string; expiresAt: string } {
  const exp = Date.now() + LINK_TOKEN_TTL_MS;
  const payload: PendingLinkPayload = {
    userId,
    provider: candidate.provider,
    candidate,
    exp,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = signPayload(encoded);
  const linkToken = `${encoded}.${sig}`;
  return { linkToken, expiresAt: new Date(exp).toISOString() };
}

export function verifyProviderLinkToken(
  linkToken: string,
  expectedUserId: string,
): PendingLinkPayload | null {
  const parts = linkToken.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = signPayload(encoded);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PendingLinkPayload;
    if (!payload?.userId || !payload?.provider || !payload?.candidate) return null;
    if (payload.userId !== expectedUserId) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createConflictStashToken(candidate: ProviderIdentityCandidate): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = Date.now() + LINK_TOKEN_TTL_MS;
  const payload = { kind: "conflict_stash" as const, candidate, exp, nonce };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = signPayload(encoded);
  return `${encoded}.${sig}`;
}

export function verifyConflictStashToken(token: string): ProviderIdentityCandidate | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = signPayload(encoded);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      kind: string;
      candidate: ProviderIdentityCandidate;
      exp: number;
    };
    if (payload.kind !== "conflict_stash" || !payload.candidate) return null;
    if (Date.now() > payload.exp) return null;
    return payload.candidate;
  } catch {
    return null;
  }
}
