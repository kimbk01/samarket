/**
 * v4 W5 · PL-05 데이터 정리 (1회 실행) — 샘플 매장 discovery_schedule_state NULL 채우기.
 *
 * 원인: `runDiscoveryScheduleTransitionBatch`(cron stores-discovery-schedule-transitions)는
 *   next_schedule_transition_at 이 NOT NULL 인 행만 고르므로, 한 번도 계산되지 않은(NULL) 샘플 매장은 영영 채워지지 않는다
 *   → 순위 함수가 「준비중」 그룹으로 분류.
 * 방법: SQL 로 같은 결과를 낼 수 없다 — 계산이 TS(`computeDiscoveryScheduleProjection`: 영업시간 JSON·매장 시간대·
 *   휴게시간·point_commerce_blocked) 에 있으므로 기존 함수 `refreshDiscoveryScheduleProjectionForStoreId` 를 그대로 호출한다
 *   (stores.discovery_schedule_state·next_schedule_transition_at 2개 컬럼만 UPDATE). 이후 갱신은 기존 cron 이 이어 받는다.
 * 대상: stores.store_kind='sample' AND discovery_schedule_state IS NULL (운영 READ ONLY 확인값 2026-10-29 PHT: 35곳).
 *   legacy_test 의 NULL 2곳은 범위 밖 — 건드리지 않음.
 *
 * 실행 (작업 폴더에서):
 *   set -a; source .env.local; set +a
 *   npx vite-node --config vitest.config.ts scripts/delivery-v4/refresh-sample-schedule.ts            # dry-run (쓰기 없음)
 *   npx vite-node --config vitest.config.ts scripts/delivery-v4/refresh-sample-schedule.ts -- --apply # 실제 저장
 * 롤백: UPDATE public.stores SET discovery_schedule_state=NULL, next_schedule_transition_at=NULL
 *         WHERE store_kind='sample' AND id IN (<출력 목록>);  (원래 NULL 이었으므로)
 */
import { createClient } from "@supabase/supabase-js";
import { computeDiscoveryScheduleProjection } from "../../lib/stores/discovery/compute-discovery-schedule-projection";
import { refreshDiscoveryScheduleProjectionForStoreId } from "../../lib/stores/discovery/persist-discovery-schedule-projection";

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("stores")
    .select("id, store_name, business_hours_json, is_open, point_commerce_blocked")
    .eq("store_kind", "sample")
    .is("discovery_schedule_state", null)
    .order("store_name", { ascending: true });
  if (error) {
    console.error("[pl05] select failed", error.message);
    process.exit(1);
  }
  const rows = data ?? [];
  const now = new Date();
  const out: Array<{ id: string; name: string; state: string; next: string | null; result: string }> = [];
  let failed = 0;

  for (const row of rows) {
    const id = String(row.id);
    const projection = computeDiscoveryScheduleProjection({
      business_hours_json: row.business_hours_json,
      is_open: row.is_open as boolean | null,
      point_commerce_blocked: row.point_commerce_blocked as boolean | null,
      now,
    });
    let result = "dry_run";
    if (apply) {
      const r = await refreshDiscoveryScheduleProjectionForStoreId(sb, id, now);
      result = r.ok ? "saved" : `failed:${r.error}`;
      if (!r.ok) failed += 1;
    }
    out.push({
      id,
      name: String(row.store_name ?? ""),
      state: projection.discoveryScheduleState,
      next: projection.nextScheduleTransitionAt,
      result,
    });
  }

  const byState: Record<string, number> = {};
  for (const o of out) byState[o.state] = (byState[o.state] ?? 0) + 1;
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry_run", now: now.toISOString(), targets: rows.length, failed, byState, rows: out }, null, 2));
  if (failed > 0) process.exit(2);
}

void main();
