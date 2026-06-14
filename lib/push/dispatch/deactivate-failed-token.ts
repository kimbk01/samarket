import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushTarget, PushTargetSource } from "@/lib/push/dispatch/push-payload-types";

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
  deviceId?: string | null
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const now = new Date().toISOString();
  let q = svc.from("user_devices").update({ is_active: false, updated_at: now }).eq("user_id", uid);
  const did = deviceId?.trim();
  if (did) {
    q = q.eq("device_id", did);
  }
  await q;
}

export type { PushTargetSource };
