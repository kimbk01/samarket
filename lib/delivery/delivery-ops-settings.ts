import type { SupabaseClient } from "@supabase/supabase-js";

export const DELIVERY_OPS_SETTING_KEYS = {
  riderLocationEnabled: "delivery_rider_location_enabled",
} as const;

export async function loadDeliveryRiderLocationEnabled(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled)
    .maybeSingle();
  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) return false;
    console.error("[loadDeliveryRiderLocationEnabled]", error);
    return false;
  }
  const v = (data as { value_json?: unknown } | null)?.value_json as { value?: unknown } | null;
  return v?.value === true;
}

