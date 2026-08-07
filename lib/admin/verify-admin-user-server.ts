import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

/**
 * DEAD / NO LIVE CALLER (2026-08-07 privilege-reader alignment).
 * trade-flow routes import `getServiceOrAnonClient` only — not this verifier.
 * Formula remains transitional `profiles.role` only; do not revive without
 * aligning to `hasActiveAdminMembershipOrLegacyRole`. Cleanup is a later step.
 */
export async function verifyAdminUserId(
  url: string,
  anonKey: string,
  userId: string,
  serviceKey?: string | null
): Promise<boolean> {
  const db = getServiceOrAnonClient(url, anonKey, serviceKey ?? undefined);
  const { data: prof } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = (prof as { role?: string } | null)?.role;
  return isPrivilegedAdminRole(role);
}

/** DEAD / NO LIVE CALLER — see `verifyAdminUserId`. */
export async function verifyAdminAccess(
  url: string,
  anonKey: string,
  userId: string,
  sessionEmail?: string | null,
  serviceKey?: string | null
): Promise<boolean> {
  void sessionEmail;
  return verifyAdminUserId(url, anonKey, userId, serviceKey);
}

export function getServiceOrAnonClient(
  url: string,
  anonKey: string,
  serviceKey: string | undefined
): SupabaseClient {
  return serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : createClient(url, anonKey);
}
