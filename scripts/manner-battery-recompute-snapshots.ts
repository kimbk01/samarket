/**
 * Recompute member_trust_snapshots for all non-deleted profiles (Manner Battery SSOT).
 * Run after trust_events backfill migration.
 *
 *   npx tsx scripts/manner-battery-recompute-snapshots.ts
 */
import { createClient } from "@supabase/supabase-js";
import { recomputeMemberTrustSnapshot } from "../lib/trust/trust-event-ledger";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: profiles, error } = await sb
    .from("profiles")
    .select("id, trust_score")
    .is("deleted_at", null);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const rows = (profiles ?? []) as { id: string; trust_score?: number | null }[];
  const changes: Array<{ memberId: string; old: number; neu: number; reason: string }> = [];

  for (const p of rows) {
    const old = p.trust_score != null && Number.isFinite(Number(p.trust_score)) ? Number(p.trust_score) : 50;
    const calc = await recomputeMemberTrustSnapshot(sb as never, p.id);
    const neu = calc.manner_battery_percent;
    if (Math.abs(old - neu) >= 0.01) {
      let reason = "policy_recompute";
      if (calc.eligible_event_count === 0 && Math.abs(neu - 50) < 0.01 && old < 50) {
        reason = "pending_report_or_legacy_penalty_removed";
      } else if (calc.manual_adjustment_sum !== 0) {
        reason = "manual_adjustment_provenance";
      } else if (calc.trade_completed_count + calc.review_good_count + calc.review_bad_count > 0) {
        reason = "trade_events_backfilled";
      }
      changes.push({ memberId: p.id.slice(0, 8), old, neu, reason });
    }
  }

  console.log(
    JSON.stringify(
      {
        members: rows.length,
        changed: changes.length,
        changes,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
