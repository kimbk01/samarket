import { getSupabaseServer } from "@/lib/chat/supabase-server";

export type MessengerCallAdminPolicy = {
  incoming_ring_timeout_seconds: number;
  incoming_ringtone_volume: number;
  busy_auto_reject_enabled: boolean;
  repeated_call_cooldown_seconds: number;
  suppress_incoming_local_notifications: boolean;
};

const DEFAULT_POLICY: MessengerCallAdminPolicy = {
  incoming_ring_timeout_seconds: 45,
  incoming_ringtone_volume: 0.72,
  busy_auto_reject_enabled: false,
  repeated_call_cooldown_seconds: 0,
  suppress_incoming_local_notifications: false,
};

const SELECT =
  "incoming_ring_timeout_seconds, incoming_ringtone_volume, busy_auto_reject_enabled, repeated_call_cooldown_seconds, suppress_incoming_local_notifications";

let policyCache: { at: number; policy: MessengerCallAdminPolicy } | null = null;
const POLICY_TTL_MS = 30_000;

function mapRow(row: Record<string, unknown> | null | undefined): MessengerCallAdminPolicy {
  if (!row) return { ...DEFAULT_POLICY };
  const t = Number(row.incoming_ring_timeout_seconds);
  const vol = Number(row.incoming_ringtone_volume);
  return {
    incoming_ring_timeout_seconds:
      Number.isFinite(t) ? Math.min(600, Math.max(10, Math.round(t))) : DEFAULT_POLICY.incoming_ring_timeout_seconds,
    incoming_ringtone_volume: Number.isFinite(vol)
      ? Math.min(1, Math.max(0, vol))
      : DEFAULT_POLICY.incoming_ringtone_volume,
    busy_auto_reject_enabled: row.busy_auto_reject_enabled === true,
    repeated_call_cooldown_seconds: (() => {
      const c = Number(row.repeated_call_cooldown_seconds);
      return Number.isFinite(c) ? Math.min(3600, Math.max(0, Math.floor(c))) : 0;
    })(),
    suppress_incoming_local_notifications: row.suppress_incoming_local_notifications === true,
  };
}

export async function getMessengerCallAdminPolicyFresh(): Promise<MessengerCallAdminPolicy> {
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb.from("admin_messenger_call_sound_settings").select(SELECT).eq("id", "default").maybeSingle();
    if (error) return { ...DEFAULT_POLICY };
    return mapRow(data as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

export async function getMessengerCallAdminPolicyCached(): Promise<MessengerCallAdminPolicy> {
  const now = Date.now();
  if (policyCache && now - policyCache.at < POLICY_TTL_MS) {
    return policyCache.policy;
  }
  const policy = await getMessengerCallAdminPolicyFresh();
  policyCache = { at: now, policy };
  return policy;
}

export function invalidateMessengerCallAdminPolicyCache(): void {
  policyCache = null;
}
