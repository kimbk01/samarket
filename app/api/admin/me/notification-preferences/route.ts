/**
 * PUT /api/admin/me/notification-preferences — 본인 관리자 운영 알림음 켜기/끄기.
 * D-8 (재감사 P-12): 런타임 게이트(admin_notification_preferences.sound_enabled)는 있는데 바꿀 화면·API 가 없었다.
 * 기존 canonical writer(upsertAdminNotificationPreference)만 연결한다.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { upsertAdminNotificationPreference } from "@/lib/notifications/policy/admin-notification-preference-storage.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { sound_enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.sound_enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "sound_enabled_required" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const saved = await upsertAdminNotificationPreference(
      admin.userId,
      { soundEnabled: body.sound_enabled },
      sb
    );
    const rm = getAuditRequestMeta(req);
    await appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: admin.userId,
      target_type: "admin_notification_preference",
      target_id: admin.userId,
      action: "admin.notification_preference.update",
      after_json: { sound_enabled: saved.soundEnabled ?? null },
      ip: rm.ip ?? null,
      user_agent: rm.userAgent ?? null,
    });
    return NextResponse.json({ ok: true, sound_enabled: saved.soundEnabled });
  } catch {
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
