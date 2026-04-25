import type { SupabaseClient } from "@supabase/supabase-js";
import { isDuplicateLoginConflict, loadAuthDuplicateLoginPolicy, type SessionConflictMeta } from "@/lib/auth/session-policy";

function isUserSessionSchemaError(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  if (error?.code === "42P01") return true;
  if (error?.code === "42P10" && message.includes("on conflict")) return true;
  if (error?.code === "42703" && message.includes("user_sessions")) return true;
  return (
    message.includes("user_sessions") &&
    (message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("could not find") ||
      message.includes("column"))
  );
}

export async function validateUserSessionRegistry(
  sb: SupabaseClient<any>,
  userId: string,
  sessionId: string
): Promise<boolean> {
  const { data, error } = await sb
    .from("user_sessions")
    .select("active")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) {
    if (isUserSessionSchemaError(error)) return true;
    return false;
  }
  if (!data) return false;
  return data.active === true;
}

type UserSessionRegistryRow = {
  session_id: string;
  active: boolean;
  login_identifier?: string | null;
  device_key?: string | null;
  browser_key?: string | null;
  ip_address?: string | null;
};

async function findConflictingSessionIds(
  sb: SupabaseClient<any>,
  userId: string,
  current: SessionConflictMeta & { session_id: string }
): Promise<string[]> {
  const policy = await loadAuthDuplicateLoginPolicy();
  if (!policy.compare_same_login_id) return [];
  const { data, error } = await sb
    .from("user_sessions")
    .select("session_id, active, login_identifier, device_key, browser_key, ip_address")
    .eq("user_id", userId)
    .eq("active", true);
  if (error) {
    if (isUserSessionSchemaError(error)) return [];
    throw new Error(error.message || "session_registry_conflict_lookup_failed");
  }
  const rows = Array.isArray(data) ? (data as UserSessionRegistryRow[]) : [];
  return rows
    .filter((row) => row.session_id !== current.session_id)
    .filter((row) =>
      isDuplicateLoginConflict(policy, current, {
        login_identifier: row.login_identifier ?? null,
        device_key: row.device_key ?? null,
        browser_key: row.browser_key ?? null,
        ip_address: row.ip_address ?? null,
      })
    )
    .map((row) => row.session_id);
}

export async function syncUserSessionRegistry(
  sb: SupabaseClient<any>,
  userId: string,
  options: {
    nextSessionId: string;
    deviceInfo?: string | null;
    loginIdentifier?: string | null;
    deviceKey?: string | null;
    browserKey?: string | null;
    ipAddress?: string | null;
  }
): Promise<void> {
  const nextSessionId = String(options.nextSessionId ?? "").trim();
  if (!nextSessionId) return;
  const now = new Date().toISOString();

  const conflictingSessionIds = await findConflictingSessionIds(sb, userId, {
    session_id: nextSessionId,
    login_identifier: options.loginIdentifier ?? null,
    device_key: options.deviceKey ?? null,
    browser_key: options.browserKey ?? null,
    ip_address: options.ipAddress ?? null,
  });

  if (conflictingSessionIds.length > 0) {
    const { error } = await sb
      .from("user_sessions")
      .update({
        active: false,
        invalidated_at: now,
        invalidation_reason: "replaced_by_policy_conflict",
        last_seen_at: now,
      })
      .eq("user_id", userId)
      .in("session_id", conflictingSessionIds)
      .eq("active", true);
    if (error && !isUserSessionSchemaError(error)) {
      throw new Error(error.message || "session_registry_rotate_failed");
    }
  }

  const { error } = await sb.from("user_sessions").upsert(
    {
      user_id: userId,
      session_id: nextSessionId,
      device_info: options.deviceInfo ?? null,
      login_identifier: options.loginIdentifier ?? null,
      device_key: options.deviceKey ?? null,
      browser_key: options.browserKey ?? null,
      ip_address: options.ipAddress ?? null,
      active: true,
      last_seen_at: now,
      invalidated_at: null,
      invalidation_reason: null,
    },
    { onConflict: "session_id" }
  );
  if (error && !isUserSessionSchemaError(error)) {
    throw new Error(error.message || "session_registry_upsert_failed");
  }
}

export async function invalidateUserSessionRegistry(
  sb: SupabaseClient<any>,
  userId: string,
  sessionId: string,
  reason: string
): Promise<void> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) return;
  const now = new Date().toISOString();
  const { error } = await sb
    .from("user_sessions")
    .update({
      active: false,
      invalidated_at: now,
      invalidation_reason: reason,
      last_seen_at: now,
    })
    .eq("user_id", userId)
    .eq("session_id", normalizedSessionId);
  if (error && !isUserSessionSchemaError(error)) {
    throw new Error(error.message || "session_registry_invalidate_failed");
  }
}
