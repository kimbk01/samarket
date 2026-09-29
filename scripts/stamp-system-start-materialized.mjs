#!/usr/bin/env node
/**
 * Post-materialize stamp: nextBuild → installed projection on durable singleton.
 * Run after `npm run generate:system-start` on a machine with service role.
 * Does NOT prove startup pixels (Owner device observation still required).
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(JSON.stringify({ ok: false, error: "missing_supabase_env" }));
    process.exit(1);
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb
    .from("app_system_start_config")
    .select(
      "revision, background_color, brand_asset_enabled, brand_asset_media_id, brand_size_preset, min_visible_ms",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("system_start_config_missing");
  const { error: upErr } = await sb
    .from("app_system_start_config")
    .update({
      materialized_revision: data.revision,
      materialized_background_color: data.background_color,
      materialized_brand_asset_enabled: data.brand_asset_enabled,
      materialized_brand_asset_media_id: data.brand_asset_media_id,
      materialized_brand_size_preset: data.brand_size_preset,
      materialized_min_visible_ms: data.min_visible_ms,
      materialized_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (upErr) throw new Error(upErr.message);
  console.log(
    JSON.stringify({
      ok: true,
      stamped: true,
      revision: data.revision,
      note: "installed_projection_stamped; pixel_proof_still_owner_device",
    }),
  );
}

main().catch((e) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }),
  );
  process.exit(1);
});
