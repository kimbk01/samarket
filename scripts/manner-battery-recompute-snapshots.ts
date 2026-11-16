/**
 * CREW REP (crew_rep_v2) 전체 재계산 — 정책 전환 때 1회 실행.
 * 매일 재계산은 예약 작업 `/api/cron/crew-rep-daily-recompute` 가 같은 함수로 한다.
 *
 *   npx tsx scripts/manner-battery-recompute-snapshots.ts --dry   # 쓰기 없이 전후 비교만
 *   npx tsx scripts/manner-battery-recompute-snapshots.ts         # 스냅샷·이력·trust_score 기록
 *   --participation  재계산 전에 참여도 사건 동기화(S3)도 실행 (--dry 와 함께 쓰면 차이만 출력)
 *   --manner         재계산 전에 매너·제재 사건 동기화(S4)도 실행
 */
import { createClient } from "@supabase/supabase-js";
import { syncMannerTrustEvents } from "../lib/trust/crew-rep-manner-sync";
import { syncParticipationTrustEvents } from "../lib/trust/crew-rep-participation-sync";
import { recomputeAllCrewRep } from "../lib/trust/crew-rep-recompute-all";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const asOf = new Date();
  const participation = process.argv.includes("--participation")
    ? await syncParticipationTrustEvents(sb as never, { asOf, dryRun })
    : null;
  if (participation) console.error(JSON.stringify({ participation }, null, 2));
  const manner = process.argv.includes("--manner") ? await syncMannerTrustEvents(sb as never, { asOf, dryRun }) : null;
  if (manner) console.error(JSON.stringify({ manner }, null, 2));
  const result = await recomputeAllCrewRep(sb as never, { cause: "policy_migration", dryRun, asOf });
  console.log(
    JSON.stringify(
      {
        dryRun,
        members: result.members,
        changed: result.changed,
        failed: result.failed,
        rows: result.rows.map((r) => ({ member: r.memberId.slice(0, 8), before: r.before, after: r.after, axis: r.axis })),
      },
      null,
      2
    )
  );
  if (result.failed > 0) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
