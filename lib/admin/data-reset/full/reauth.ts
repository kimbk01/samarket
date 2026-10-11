/**
 * Full data reset — server re-authentication of the acting Super Admin.
 *
 * Session presence is not re-auth. The admin re-enters the account password; it is checked
 * against Supabase Auth with a throw-away anon client (no cookies, no persisted session) and the
 * session that check creates is revoked immediately (scope "local" — the admin's other sessions are
 * untouched). If the account has MFA enrolled (nextLevel aal2), the current browser session must
 * already be AAL2. MFA itself is not added by this change; it is enforced only where enrolled.
 * Repeated failures lock re-auth for 15 minutes (counted from the audit trail).
 * The password is never logged or stored.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

export const FULL_RESET_REAUTH_MAX_FAILURES = 5;
export const FULL_RESET_REAUTH_LOCK_MINUTES = 15;

export type ReauthResult = { ok: true } | { ok: false; reason: string };

async function recentFailures(sb: SupabaseClient, actorUserId: string): Promise<number> {
  const since = new Date(Date.now() - FULL_RESET_REAUTH_LOCK_MINUTES * 60_000).toISOString();
  const { count, error } = await sb
    .from("data_reset_audit_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_user_id", actorUserId)
    .eq("action", "reauth")
    .eq("outcome", "blocked")
    .gte("at", since);
  if (error) return Number.POSITIVE_INFINITY; // cannot prove the actor is under the limit → locked
  return count ?? 0;
}

export async function reauthenticateSuperAdmin(input: {
  sb: SupabaseClient;
  actorUserId: string;
  password: string;
}): Promise<ReauthResult> {
  const password = String(input.password ?? "");
  if (!password) return { ok: false, reason: "password_required" };

  if ((await recentFailures(input.sb, input.actorUserId)) >= FULL_RESET_REAUTH_MAX_FAILURES) {
    return { ok: false, reason: "reauth_locked" };
  }

  const env = requireSupabaseEnv({ requireAnonKey: true });
  if (!env.ok) return { ok: false, reason: "auth_env_missing" };

  const { data: userData, error: userErr } = await input.sb.auth.admin.getUserById(input.actorUserId);
  const email = userData?.user?.email;
  if (userErr || !email) return { ok: false, reason: "actor_email_unavailable" };

  const probe = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: signIn, error: signErr } = await probe.auth.signInWithPassword({ email, password });
  if (signErr || !signIn?.user) return { ok: false, reason: "invalid_credentials" };
  if (signIn.user.id !== input.actorUserId) {
    await probe.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { ok: false, reason: "reauth_identity_mismatch" };
  }
  await probe.auth.signOut({ scope: "local" }).catch(() => undefined);

  // MFA: when the account has a verified factor, the acting browser session must be AAL2.
  const route = await createSupabaseRouteHandlerClient();
  if (!route) return { ok: false, reason: "session_unavailable" };
  const { data: aal, error: aalErr } = await route.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalErr) return { ok: false, reason: "aal_unavailable" };
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") return { ok: false, reason: "mfa_aal2_required" };

  return { ok: true };
}
