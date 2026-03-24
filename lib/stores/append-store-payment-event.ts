import type { SupabaseClient } from "@supabase/supabase-js";

export async function appendStorePaymentEvent(
  sb: SupabaseClient,
  row: {
    source: string;
    order_id: string | null;
    event_type: string;
    provider?: string | null;
    transmission_id?: string | null;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await sb.from("store_payment_events").insert({
    source: row.source,
    order_id: row.order_id,
    event_type: row.event_type,
    provider: row.provider ?? null,
    transmission_id: row.transmission_id ?? null,
    payload: row.payload,
  });
  if (error && !error.message?.includes("does not exist")) {
    console.error("[appendStorePaymentEvent]", error);
  }
}
