import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  COMMUNITY_POST_IMAGE_GC_CREATED_AFTER,
  findCommunityImageGcCandidates,
  removeCommunityPostImageOriginals,
} from "@/lib/community/community-post-image-gc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 커뮤니티 글 사진 고아 정리 (Owner 승인 ③ 2026-10-31) — 하루 1회.
 * `vercel.json` crons: `50 19 * * *` (UTC) = 매일 03:50 PHT (Asia/Manila, UTC+8). Vercel Cron 은 UTC 만 지원.
 * 대상: 2026-10-31 이후 올린 커뮤니티 글 사진 원본 중 72시간 경과 · 어디에서도 참조 안 됨 → 원본+파생 삭제(1회 최대 200).
 * 결과(삭제 경로 전부)는 로그 + 감사 `community_images.orphan_gc` 1건.
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const found = await findCommunityImageGcCandidates(sb);
  if (!found.ok) {
    console.error("[cron community-post-images-gc] candidates", found.error);
    return NextResponse.json({ ok: false, error: "candidates_failed" }, { status: 500 });
  }
  const res = await removeCommunityPostImageOriginals(sb, found.names);
  const summary = {
    created_after: COMMUNITY_POST_IMAGE_GC_CREATED_AFTER,
    candidates: found.names.length,
    removed_paths: res.removed.length,
    failed: res.failed.length,
  };
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
  return NextResponse.json({ ok: res.failed.length === 0, ...summary });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
