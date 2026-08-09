/**
 * Production Feed Banner delivery sanitation — list + optional end invalid creatives.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/feed-ad-end-invalid-creatives.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/feed-ad-end-invalid-creatives.ts --apply
 *
 * Policy: do not delete. Set campaign status=ended (+ end_at=now) when no
 * production-reachable creative remains. Preserves rows for audit.
 */

import { createClient } from "@supabase/supabase-js";
import { isProductionReachableFeedAdCreativeUrl } from "../lib/ads/feed-ad-creative-url";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: campaigns, error } = await sb
    .from("feed_ad_campaigns")
    .select("id, name, domain, placement, status, source, request_id, start_at, end_at")
    .in("status", ["active", "scheduled", "paused", "draft"])
    .limit(200);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const ids = (campaigns ?? []).map((c) => String(c.id)).filter(Boolean);
  const { data: creatives } = await sb
    .from("feed_ad_creatives")
    .select("id, campaign_id, image_url, is_active, sort_order")
    .in("campaign_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const byCamp = new Map<string, { image_url?: string }[]>();
  for (const row of creatives ?? []) {
    const cid = String((row as { campaign_id?: string }).campaign_id ?? "");
    const list = byCamp.get(cid) ?? [];
    list.push(row as { image_url?: string });
    byCamp.set(cid, list);
  }

  type Target = {
    id: string;
    name: unknown;
    status: unknown;
    domain: unknown;
    placement: unknown;
    source: unknown;
    request_id: unknown;
    invalidUrls: string[];
  };
  const targets: Target[] = [];
  for (const c of campaigns ?? []) {
    const slides = byCamp.get(String(c.id)) ?? [];
    const urls = slides.map((s) => String(s.image_url ?? "").trim()).filter(Boolean);
    const anyValid = urls.some((u) => isProductionReachableFeedAdCreativeUrl(u));
    const invalidUrls = urls.filter((u) => !isProductionReachableFeedAdCreativeUrl(u));
    if (urls.length === 0 || !anyValid) {
      targets.push({
        id: String(c.id),
        name: c.name,
        status: c.status,
        domain: c.domain,
        placement: c.placement,
        source: c.source,
        request_id: c.request_id,
        invalidUrls,
      });
    }
  }

  console.log(
    JSON.stringify({ mode: apply ? "apply" : "dry-run", count: targets.length, targets }, null, 2)
  );

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to set status=ended.");
    return;
  }

  const now = new Date().toISOString();
  for (const t of targets) {
    if (String(t.status) === "ended") continue;
    const { error: updErr } = await sb
      .from("feed_ad_campaigns")
      .update({
        status: "ended",
        end_at: now,
        updated_at: now,
      })
      .eq("id", t.id)
      .neq("status", "ended");
    if (updErr) {
      console.error("FAIL", t.id, updErr.message);
    } else {
      console.log("ENDED", t.id, t.name);
    }
  }
}

void main();
