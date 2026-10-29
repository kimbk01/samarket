import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { isStoreProductImagesOrphanGcDeleteEnabled } from "@/lib/stores/store-product-images-orphan-gc";
import { runStoreProductImagesOrphanGc } from "@/lib/stores/store-product-images-orphan-gc.server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 3-E PRD-16 — 매장 이미지(`store-product-images/{storeId}/`) 고아 객체 GC. 일 1회 호출 대상.
 * 기본 dry-run: 삭제 0, 매장별 고아 수·샘플만 응답·로그. 실삭제는 Owner 승인 후
 * `STORE_PRODUCT_IMAGES_ORPHAN_GC_DELETE_ENABLED=1` 일 때만 (Storage 데이터 삭제 = D-5 운영 데이터 변경 성격).
 * 인증: `CRON_SECRET` (다른 크론 라우트와 동일).
 *
 * 묶음 4 · O-02 — `vercel.json` crons 에 하루 1회 등록: `30 19 * * *` (UTC) = 매일 03:30 PHT (Asia/Manila, UTC+8).
 * Vercel Cron 은 UTC 만 지원(CRON_TZ 미지원)이라 UTC 로 적고 PHT 를 여기 병기한다. dry-run 유지 — 실삭제 env 는 켜지 않는다
 * (Owner: Storage 일괄 삭제 D-7 제외). 결과(후보 수)는 로그 + 감사 `store_images.orphan_gc` 1건으로 남긴다.
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const dryRun = !isStoreProductImagesOrphanGcDeleteEnabled();
  const out = await runStoreProductImagesOrphanGc({
    sb: sb as import("@supabase/supabase-js").SupabaseClient<any>,
    dryRun,
  });
  if (!out.ok) {
    return NextResponse.json({ ok: false, error: out.error }, { status: 500 });
  }
  const r = out.result;
  console.info("[cron store-product-images-orphan-gc]", {
    dry_run: r.dry_run,
    stores_scanned: r.stores_scanned,
    stores_skipped: r.stores_skipped,
    objects: r.objects,
    orphans: r.orphans,
    removed: r.removed,
    remove_failed: r.remove_failed,
  });
  // O-02 — 매일 후보 수를 감사 기록으로도 남긴다 (Vercel 로그 보존 기간과 무관하게 추이 확인). 실패해도 응답은 유지.
  await appendAuditLog(sb as unknown as import("@supabase/supabase-js").SupabaseClient, {
    actor_type: "system",
    target_type: "store_images",
    target_id: "store-product-images",
    action: "store_images.orphan_gc",
    after_json: {
      dry_run: r.dry_run,
      stores_scanned: r.stores_scanned,
      stores_skipped: r.stores_skipped,
      objects: r.objects,
      orphans: r.orphans,
      removed: r.removed,
      remove_failed: r.remove_failed,
      stores_with_orphans: r.stores
        .filter((x) => x.orphans > 0)
        .slice(0, 50)
        .map((x) => ({ store_id: x.store_id, orphans: x.orphans })),
    },
  }).catch((e: unknown) => console.error("[cron store-product-images-orphan-gc] audit", e));
  return NextResponse.json({ ok: true, ...r });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
