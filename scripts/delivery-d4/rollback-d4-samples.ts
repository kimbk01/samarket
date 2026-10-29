/**
 * D-4 샘플 추가분 롤백 — samples.json 의 slug + 매장명이 모두 일치하는 store_kind='sample' 행만
 * `admin_delete_sample_store` (매장별 트랜잭션·연결 데이터 재검증·CASCADE) 로 삭제한다. 기존 샘플 35곳·실매장은 대상 아님.
 * Storage 이미지는 삭제 함수가 경로만 돌려준다(D-7 방침: Storage 는 남김) — 결과 JSON 의 images 로 기록.
 *
 * 실행:
 *   set -a; source .env.local; set +a
 *   npx vite-node --config vitest.config.ts scripts/delivery-d4/rollback-d4-samples.ts            # dry-run (미리보기만)
 *   npx vite-node --config vitest.config.ts scripts/delivery-d4/rollback-d4-samples.ts -- --apply  # 실제 삭제
 *   옵션: --only=<key,key>
 */
import { createClient } from "@supabase/supabase-js";
import { D4_AUDIT_ACTOR_ID, loadD4Samples, parseD4Args } from "./d4-samples-core";
import { appendAuditLog } from "../../lib/audit/append-audit-log";

async function main() {
  const args = parseD4Args(process.argv);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const all = loadD4Samples().stores;
  const stores = args.only ? all.filter((s) => args.only!.includes(s.key)) : all;

  const { data, error } = await sb
    .from("stores")
    .select("id, slug, store_name, store_kind")
    .in("slug", stores.map((s) => s.slug));
  if (error) {
    console.error("[d4-rollback] select failed", error.message);
    process.exit(1);
  }
  const targets = (data ?? []).filter((r: any) => {
    const s = stores.find((x) => x.slug === r.slug);
    return r.store_kind === "sample" && s && s.store_name === r.store_name;
  });

  if (!args.apply) {
    const ids = targets.map((t: any) => t.id);
    const { data: preview, error: pErr } = ids.length
      ? await sb.rpc("admin_sample_store_delete_preview", { p_store_ids: ids })
      : { data: [], error: null };
    console.log(JSON.stringify({ mode: "dry_run", targets: targets.length, preview, preview_error: pErr?.message ?? null }, null, 2));
    return;
  }

  const results: unknown[] = [];
  let failed = 0;
  for (const t of targets as Array<{ id: string; slug: string; store_name: string }>) {
    const { data: r, error: dErr } = await sb.rpc("admin_delete_sample_store", { p_store_id: t.id, p_actor: D4_AUDIT_ACTOR_ID });
    const status = (r as { status?: string } | null)?.status ?? "error";
    if (dErr || (status !== "deleted" && status !== "already_deleted")) failed += 1;
    else {
      await appendAuditLog(sb, {
        actor_type: "admin",
        actor_id: D4_AUDIT_ACTOR_ID,
        target_type: "store",
        target_id: t.id,
        action: "store.sample.delete",
        after_json: { reason: "D-4 샘플 추가분 롤백", slug: t.slug, store_name: t.store_name, operator: "claude-ops" },
      });
    }
    results.push({ id: t.id, slug: t.slug, store_name: t.store_name, status, error: dErr?.message ?? null, result: r });
  }
  console.log(JSON.stringify({ mode: "apply", targets: targets.length, failed, results }, null, 2));
  if (failed > 0) process.exit(3);
}

void main();
