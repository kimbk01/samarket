import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushTarget, PushTargetSource } from "@/lib/push/dispatch/push-payload-types";
import type { PushEnvironment } from "@/lib/push/push-environment";

export async function deactivateFailedPushTarget(
  svc: SupabaseClient,
  target: PushTarget,
  reason?: string
): Promise<void> {
  const now = new Date().toISOString();
  if (target.source === "user_devices") {
    await svc
      .from("user_devices")
      .update({ is_active: false, updated_at: now })
      .eq("id", target.id);
    return;
  }
  if (target.source === "web_push_subscriptions") {
    if (reason === "gone" || reason === "not_found") {
      await svc.from("web_push_subscriptions").delete().eq("id", target.id);
      return;
    }
    await svc
      .from("web_push_subscriptions")
      .update({ is_active: false, updated_at: now })
      .eq("id", target.id);
  }
}

export async function deactivateAllUserDevicesForLogout(
  svc: SupabaseClient,
  userId: string,
  deviceId?: string | null,
  environment?: PushEnvironment
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const now = new Date().toISOString();
  let q = svc.from("user_devices").update({ is_active: false, updated_at: now }).eq("user_id", uid);
  if (environment) {
    q = q.eq("environment", environment);
  }
  const did = deviceId?.trim();
  if (did) {
    q = q.eq("device_id", did);
  }
  await q;
}

/**
 * WP-13 NEW-09: on member withdrawal/purge, deactivate ALL of the user's push tokens so a removed
 * account's devices stop receiving pushes. Non-destructive (is_active=false), and independent of
 * retention period / FK CASCADE policy — it flips only the user's own token rows. Reuses the
 * existing user_devices deactivation authority and mirrors it for web_push_subscriptions.
 * Best-effort: callers run this after the account removal already succeeded; errors are returned,
 * not thrown, so token-cleanup failure never rolls back the deletion.
 */
export async function deactivateAllUserPushTokensForAccountRemoval(
  svc: SupabaseClient,
  userId: string
): Promise<{ ok: boolean; errors: string[] }> {
  const uid = userId.trim();
  if (!uid) return { ok: false, errors: ["invalid_user_id"] };
  const now = new Date().toISOString();
  const errors: string[] = [];
  try {
    await deactivateAllUserDevicesForLogout(svc, uid);
  } catch (error) {
    errors.push(`user_devices:${error instanceof Error ? error.message : String(error)}`);
  }
  const wp = await svc
    .from("web_push_subscriptions")
    .update({ is_active: false, updated_at: now })
    .eq("user_id", uid);
  if (wp.error) errors.push(`web_push_subscriptions:${wp.error.message}`);
  return { ok: errors.length === 0, errors };
}

export type { PushTargetSource };
