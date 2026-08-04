import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import { buildGoogleSupabasePassword } from "@/lib/auth/native/google-native-session.server";
import type { ProviderIdentityCandidate } from "@/lib/auth/provider-identity/types";
import { hashPrefixForAuthDiag } from "@/lib/auth/provider-identity/web-oauth-policy-diagnostics.server";

const OAUTH_LANDING_EMAIL_DOMAIN = "oauth-landing.dibay.internal";

const rebindFlights = new Map<string, Promise<WebOAuthOwnerRebindResult>>();

export type WebOAuthOwnerRebindResult =
  | {
      ok: true;
      ownerUser: User;
      temporaryUserId: string;
      disposeMode: "landing_pad_tombstone" | "already_landing_pad" | "skipped";
    }
  | {
      ok: false;
      errorCode: "oauth_rebind_failed";
      message: string;
      temporaryUserId: string;
      ownerUserId: string;
    };

function flightKey(provider: string, providerUserId: string): string {
  return `${provider}:${providerUserId}`;
}

function isLandingPadEmail(email: string | null | undefined): boolean {
  return String(email ?? "").trim().toLowerCase().endsWith(`@${OAUTH_LANDING_EMAIL_DOMAIN}`);
}

function buildLandingPadEmail(temporaryUserId: string): string {
  const compact = temporaryUserId.replace(/-/g, "");
  return `pad.${compact}.${Date.now()}@${OAUTH_LANDING_EMAIL_DOMAIN}`;
}

function logRebind(payload: Record<string, unknown>): void {
  console.info("[auth/web-oauth-rebind]", JSON.stringify(payload));
}

/** Supabase SSR chunked session cookies — stale higher chunks cause Invalid UTF-8. */
export function isSupabaseAuthCookieName(name: string): boolean {
  if (name.includes("auth-token") || name.includes("code-verifier")) return true;
  if (name === "supabase.auth.token" || name.startsWith("supabase.auth.token.")) return true;
  return false;
}

/**
 * Expire every auth cookie on the redirect response (request + already-set response).
 * Required before replacing exchangeCodeForSession cookies with owner password session.
 */
export function wipeSupabaseAuthCookies(req: NextRequest, response: NextResponse): number {
  const names = new Set<string>();
  for (const cookie of req.cookies.getAll()) names.add(cookie.name);
  for (const cookie of response.cookies.getAll()) names.add(cookie.name);

  let wiped = 0;
  for (const name of names) {
    if (!isSupabaseAuthCookieName(name)) continue;
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
    wiped += 1;
  }
  return wiped;
}

async function establishOwnerSession(
  adminSb: SupabaseClient,
  routeSb: SupabaseClient,
  ownerUserId: string,
  candidate: ProviderIdentityCandidate,
): Promise<User> {
  const { data: ownerData, error: ownerError } = await adminSb.auth.admin.getUserById(ownerUserId);
  const owner = ownerData?.user;
  if (ownerError || !owner) {
    throw new Error(ownerError?.message || "owner_auth_user_missing");
  }

  const ownerEmail = String(owner.email ?? "").trim();
  if (!ownerEmail) {
    throw new Error("owner_email_missing");
  }

  if (candidate.provider !== "google" || !candidate.providerUserId.trim()) {
    throw new Error("owner_session_reissue_unsupported_provider");
  }

  const password = buildGoogleSupabasePassword(candidate.providerUserId);
  const { error: updateError } = await adminSb.auth.admin.updateUserById(ownerUserId, {
    password,
    email_confirm: true,
  });
  if (updateError) {
    throw new Error(updateError.message || "owner_password_update_failed");
  }

  const { data: signed, error: signError } = await routeSb.auth.signInWithPassword({
    email: ownerEmail,
    password,
  });
  if (signError || !signed.user || signed.user.id !== ownerUserId) {
    throw new Error(signError?.message || "owner_password_sign_in_failed");
  }
  return signed.user;
}

async function tombstoneLandingPadUser(
  adminSb: SupabaseClient,
  temporaryUser: User,
  ownerUserId: string,
): Promise<"landing_pad_tombstone" | "already_landing_pad"> {
  if (isLandingPadEmail(temporaryUser.email)) {
    return "already_landing_pad";
  }

  const meta =
    temporaryUser.user_metadata && typeof temporaryUser.user_metadata === "object"
      ? { ...(temporaryUser.user_metadata as Record<string, unknown>) }
      : {};
  meta.dibay_oauth_landing_pad = true;
  meta.dibay_canonical_user_hash = hashPrefixForAuthDiag(ownerUserId);
  meta.dibay_landing_pad_at = new Date().toISOString();

  const { error } = await adminSb.auth.admin.updateUserById(temporaryUser.id, {
    email: buildLandingPadEmail(temporaryUser.id),
    email_confirm: true,
    user_metadata: meta,
  });
  if (error) {
    logRebind({
      event: "landing_pad_tombstone_failed",
      temporaryUserIdHashPrefix: hashPrefixForAuthDiag(temporaryUser.id),
      ownerUserIdHashPrefix: hashPrefixForAuthDiag(ownerUserId),
      error: error.message.slice(0, 120),
    });
    return "landing_pad_tombstone";
  }
  return "landing_pad_tombstone";
}

async function runWebOAuthOwnerRebind(input: {
  adminSb: SupabaseClient;
  routeSb: SupabaseClient;
  temporaryUser: User;
  ownerUserId: string;
  candidate: ProviderIdentityCandidate;
  callbackAttemptId: string;
  wipeAuthCookies: () => number;
}): Promise<WebOAuthOwnerRebindResult> {
  const temporaryUserId = input.temporaryUser.id;
  const ownerUserId = input.ownerUserId.trim();

  if (!ownerUserId) {
    return {
      ok: false,
      errorCode: "oauth_rebind_failed",
      message: "owner_user_id_missing",
      temporaryUserId,
      ownerUserId: "",
    };
  }

  if (temporaryUserId === ownerUserId) {
    return {
      ok: true,
      ownerUser: input.temporaryUser,
      temporaryUserId,
      disposeMode: "skipped",
    };
  }

  logRebind({
    event: "rebind_start",
    callbackAttemptId: input.callbackAttemptId,
    provider: input.candidate.provider,
    subjectHashPrefix: hashPrefixForAuthDiag(input.candidate.providerUserId),
    temporaryUserIdHashPrefix: hashPrefixForAuthDiag(temporaryUserId),
    ownerUserIdHashPrefix: hashPrefixForAuthDiag(ownerUserId),
  });

  try {
    // 1) Drop exchange session cookies (all chunks) — leftover .N chunks → Invalid UTF-8.
    const wipedBefore = input.wipeAuthCookies();
    await input.routeSb.auth.signOut({ scope: "local" });
    const wipedAfterSignOut = input.wipeAuthCookies();

    // 2) Write a single clean owner session.
    const ownerUser = await establishOwnerSession(
      input.adminSb,
      input.routeSb,
      ownerUserId,
      input.candidate,
    );

    const disposeMode = await tombstoneLandingPadUser(
      input.adminSb,
      input.temporaryUser,
      ownerUserId,
    );

    logRebind({
      event: "rebind_ok",
      callbackAttemptId: input.callbackAttemptId,
      provider: input.candidate.provider,
      subjectHashPrefix: hashPrefixForAuthDiag(input.candidate.providerUserId),
      temporaryUserIdHashPrefix: hashPrefixForAuthDiag(temporaryUserId),
      ownerUserIdHashPrefix: hashPrefixForAuthDiag(ownerUserId),
      disposeMode,
      wipedBefore,
      wipedAfterSignOut,
    });

    return {
      ok: true,
      ownerUser,
      temporaryUserId,
      disposeMode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "oauth_rebind_failed";
    logRebind({
      event: "rebind_failed",
      callbackAttemptId: input.callbackAttemptId,
      provider: input.candidate.provider,
      subjectHashPrefix: hashPrefixForAuthDiag(input.candidate.providerUserId),
      temporaryUserIdHashPrefix: hashPrefixForAuthDiag(temporaryUserId),
      ownerUserIdHashPrefix: hashPrefixForAuthDiag(ownerUserId),
      error: message.slice(0, 160),
    });
    try {
      input.wipeAuthCookies();
      await input.routeSb.auth.signOut({ scope: "local" });
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      errorCode: "oauth_rebind_failed",
      message,
      temporaryUserId,
      ownerUserId,
    };
  }
}

/**
 * When Supabase OAuth session user ≠ DIBAY SSOT owner for the same provider subject,
 * discard the temporary session and issue cookies for the owner.
 *
 * Parallel auth.users is tombstoned as an OAuth landing pad (identity kept) — no hard delete.
 */
export async function rebindWebOAuthSessionToOwner(input: {
  adminSb: SupabaseClient;
  routeSb: SupabaseClient;
  temporaryUser: User;
  ownerUserId: string;
  candidate: ProviderIdentityCandidate;
  callbackAttemptId: string;
  wipeAuthCookies: () => number;
}): Promise<WebOAuthOwnerRebindResult> {
  const key = flightKey(input.candidate.provider, input.candidate.providerUserId);
  const existing = rebindFlights.get(key);
  if (existing) return existing;

  const flight = runWebOAuthOwnerRebind(input).finally(() => {
    rebindFlights.delete(key);
  });
  rebindFlights.set(key, flight);
  return flight;
}

/** Test helper — stable fingerprint without PII. */
export function fingerprintForRebindTests(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
