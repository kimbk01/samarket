/**
 * Verify store_order_deliveries columns exist (service role).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const SELECT =
  "order_id, store_id, buyer_user_id, rider_id, delivery_status, assigned_at, picked_up_at, delivered_at, admin_note, failure_reason, rider_accepted_at, customer_arrived_at, rider_decline_reason, delivered_proof_image_path, delivered_proof_image_url, delivered_proof_note, delivered_receiver_name, delivered_confirmed_at, delivered_proof_lat, delivered_proof_lng, failure_proof_image_path, failure_proof_image_url, failure_note, rider_failure_reported_at, rider_failure_report_reason, failure_report_lat, failure_report_lng, failed_at, updated_at";

function loadEnv() {
  const raw = readFileSync(".env.local", "utf8");
  const env = {};
  for (const line of raw.split(/\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const r = await sb.from("store_order_deliveries").select(SELECT).limit(1);
if (r.error) {
  console.log(JSON.stringify({ ok: false, error: r.error.message, code: r.error.code }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, message: "full DELIVERY_ROW_SELECT works" }));
