import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  COMMUNITY_DELETED_POST_IMAGE_RETENTION_DAYS,
  COMMUNITY_POST_IMAGE_GC_CREATED_AFTER,
  findCommunityImageGcCandidates,
  purgeExpiredDeletedPostImages,
  removeCommunityPostImageOriginals,
} from "@/lib/community/community-post-image-gc.server";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 커뮤니티 글 사진 고아 정리 (Owner 승인 ③ 2026-10-31) — 하루 1회.
 * `vercel.json` crons: `50 19 * * *` (UTC) = 매일 03:50 PHT (Asia/Manila, UTC+8). Vercel Cron 은 UTC 만 지원.
 * 대상: 2026-10-31 이후 올린 커뮤니티 글 사진 원본 중 72시간 경과 · 어디에서도 참조 안 됨 → 원본+파생 삭제(1회 최대 200).
 * 결과(삭제 경로 전부)는 로그 + 감사 `community_images.orphan_gc` 1건.
 * 이어서 삭제한 지 30일 지난 글의 사진 정리(Owner 2026-11-20 「30일 뒤 삭제」) — 감사 `community_images.deleted_post_purge` 1건.
 * 두 단계는 서로 막지 않는다(한쪽이 실패해도 다른 쪽은 돈다, 결과에 각각 남김).
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const cronSideEffectsBlocked = rejectCronIfSideEffectsBlocked();
  if (cronSideEffectsBlocked) return cronSideEffectsBlocked;
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const found = await findCommunityImageGcCandidates(sb);
  let orphanOk = found.ok;
  let summary: Record<string, unknown> = { created_after: COMMUNITY_POST_IMAGE_GC_CREATED_AFTER };
  if (!found.ok) {
    console.error("[cron community-post-images-gc] candidates", found.error);
    summary = { ...summary, error: "candidates_failed" };
  } else {
    const res = await removeCommunityPostImageOriginals(sb, found.names);
    orphanOk = res.failed.length === 0;
    summary = { ...summary, candidates: found.names.length, removed_paths: res.removed.length, failed: res.failed.length };
    console.info("[cron community-post-images-gc]", summary, { originals: found.names, failed: res.failed });
    if (found.names.length > 0) {
      await appendAuditLog(sb, {
        actor_type: "system",
        target_type: "community_images",
        target_id: "post-images/community",
        action: "community_images.orphan_gc",
        after_json: { ...summary, originals: found.names, failed_detail: res.failed },
      }).catch((e: unknown) => console.error("[cron community-post-images-gc] audit", e));
    }
  }

  /** 삭제 30일 지난 글의 사진 */
  const purge = await purgeExpiredDeletedPostImages(sb);
  let purgeSummary: Record<string, unknown>;
  if (!purge.ok) {
    console.error("[cron community-post-images-gc] deleted-post purge", purge.error);
    purgeSummary = { error: "deleted_post_purge_failed" };
  } else {
    purgeSummary = {
      retention_days: COMMUNITY_DELETED_POST_IMAGE_RETENTION_DAYS,
      posts: purge.posts.length,
      skipped_open_reports: purge.skippedOpenReports.length,
      originals: purge.originals.length,
      removed_paths: purge.removed.length,
      failed: purge.failed.length,
    };
    console.info("[cron community-post-images-gc] deleted-post purge", purgeSummary, { posts: purge.posts, failed: purge.failed });
    if (purge.posts.length > 0 || purge.failed.length > 0) {
      await appendAuditLog(sb, {
        actor_type: "system",
        target_type: "community_images",
        target_id: "post-images/community",
        action: "community_images.deleted_post_purge",
        after_json: { ...purgeSummary, post_ids: purge.posts, skipped_open_report_post_ids: purge.skippedOpenReports, removed: purge.removed, failed_detail: purge.failed },
      }).catch((e: unknown) => console.error("[cron community-post-images-gc] purge audit", e));
    }
  }
  const ok = orphanOk && purge.ok && purge.failed.length === 0;
  return NextResponse.json({ ok, ...summary, deleted_post_purge: purgeSummary }, { status: found.ok ? 200 : 500 });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
