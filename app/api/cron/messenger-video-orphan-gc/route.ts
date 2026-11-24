import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { MESSENGER_PRIVATE_MEDIA_BUCKET } from "@/lib/community-messenger/media/messenger-media-ref";
import { MESSENGER_VIDEO_ORPHAN_GRACE_MS } from "@/lib/community-messenger/upload/messenger-video-upload-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 200;

/**
 * 채팅 영상 고아 정리 (설계 docs/audit/messenger-video-send-audit-design-2026-11-24.md §3-5 · Owner 2026-11-24 승인) — 하루 1회.
 * `vercel.json` crons: `10 20 * * *` (UTC) = 매일 04:10 PHT.
 * 대상: 업로드 뒤 24시간이 지났는데 어떤 영상 메시지에도 연결되지 않은 `messenger-video/` 영상·썸네일(1회 최대 200).
 * 메시지가 가리키는 파일은 SQL 이 제외한다. 결과는 로그 + 감사 `messenger_media.video_orphan_gc` 1건(삭제 있을 때만).
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const blocked = rejectCronIfSideEffectsBlocked();
  if (blocked) return blocked;
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const minAgeHours = Math.round(MESSENGER_VIDEO_ORPHAN_GRACE_MS / 3_600_000);
  const { data, error } = await sb.rpc("messenger_video_orphan_candidates", {
    p_min_age: `${minAgeHours} hours`,
    p_limit: BATCH_LIMIT,
  });
  if (error) {
    console.error("[cron messenger-video-orphan-gc] candidates", error.message);
    return NextResponse.json({ ok: false, error: "candidates_failed" }, { status: 500 });
  }
  const names = ((data ?? []) as { name?: unknown }[])
    .map((r) => (typeof r.name === "string" ? r.name : ""))
    .filter(Boolean);
  if (names.length === 0) return NextResponse.json({ ok: true, candidates: 0, removed: 0 });
  const { error: rmErr } = await sb.storage.from(MESSENGER_PRIVATE_MEDIA_BUCKET).remove(names);
  const summary = { candidates: names.length, removed: rmErr ? 0 : names.length, error: rmErr?.message ?? null };
  console.info("[cron messenger-video-orphan-gc]", summary, { names });
  await appendAuditLog(sb, {
    actor_type: "system",
    target_type: "messenger_media",
    target_id: `${MESSENGER_PRIVATE_MEDIA_BUCKET}/messenger-video`,
    action: "messenger_media.video_orphan_gc",
    after_json: { ...summary, names },
  }).catch((e: unknown) => console.error("[cron messenger-video-orphan-gc] audit", e));
  return NextResponse.json({ ok: !rmErr, ...summary }, { status: rmErr ? 500 : 200 });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
