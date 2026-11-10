import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  readContactsAdminSettings,
  runContactsDailyMaintenance,
} from "@/lib/community-messenger/contacts/contacts-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 메신저 연락처 매일 정리 (SSOT v5 §8·§5-3) — `vercel.json` crons `10 20 * * *` (UTC) = 매일 04:10 PHT.
 * 기존 정리 작업(19:30·19:50 UTC)과 겹치지 않게. 표가 없으면(운영 미적용) 아무것도 하지 않는다.
 * 내용: 180일 미사용 기기 연락처 삭제 · 버려진 스냅숏 · 인증 풀린 번호 등록 삭제 · 고아 재추천 제한 ·
 *       재추천 제한 기록 실패분 복구 · 번호 변경 반영. 결과는 감사 `messenger_contacts.daily_maintenance` 1건.
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const blocked = rejectCronIfSideEffectsBlocked();
  if (blocked) return blocked;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const settings = await readContactsAdminSettings(sb);
  if (!settings.ok) return NextResponse.json({ ok: false, error: "settings_failed" }, { status: 500 });
  if (settings.tableMissing) return NextResponse.json({ ok: true, skipped: "migration_not_applied" });

  const r = await runContactsDailyMaintenance(sb);
  if (!r.ok) {
    console.error("[cron messenger-contacts-maintenance]", r.error);
    // 실패도 감사 기록 1건 (§5-3 「조용한 무시 없음」 — 그날 정리가 안 된 사실을 남긴다)
    await appendAuditLog(sb, {
      actor_type: "system",
      target_type: "messenger_contacts",
      target_id: "daily",
      action: "messenger_contacts.daily_maintenance",
      after_json: { ok: false, error: r.error },
    }).catch((e: unknown) => console.error("[cron messenger-contacts-maintenance] audit", e));
    return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  }
  const summary = { ...r.value.maintenance, lookups_refreshed: r.value.lookupsRefreshed, lookups_skipped: r.value.lookupsSkipped };
  console.info("[cron messenger-contacts-maintenance]", summary);
  await appendAuditLog(sb, {
    actor_type: "system",
    target_type: "messenger_contacts",
    target_id: "daily",
    action: "messenger_contacts.daily_maintenance",
    after_json: summary,
  }).catch((e: unknown) => console.error("[cron messenger-contacts-maintenance] audit", e));
  return NextResponse.json({ ok: true, ...summary });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
