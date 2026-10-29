import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { isStoreProductImagesOrphanGcDeleteEnabled } from "@/lib/stores/store-product-images-orphan-gc";
import { runStoreProductImagesOrphanGc } from "@/lib/stores/store-product-images-orphan-gc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 3-E PRD-16 — 매장 이미지(`store-product-images/{storeId}/`) 고아 객체 GC. 일 1회 호출 대상.
 * 기본 dry-run: 삭제 0, 매장별 고아 수·샘플만 응답·로그. 실삭제는 Owner 승인 후
 * `STORE_PRODUCT_IMAGES_ORPHAN_GC_DELETE_ENABLED=1` 일 때만 (Storage 데이터 삭제 = D-5 운영 데이터 변경 성격).
 * 인증: `CRON_SECRET` (다른 크론 라우트와 동일).
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
  return NextResponse.json({ ok: true, ...r });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
