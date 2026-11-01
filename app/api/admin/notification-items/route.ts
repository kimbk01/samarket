import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  loadNotificationItemsAdminPayload,
  saveNotificationItemSettings,
  type NotificationItemSettingPatch,
} from "@/lib/admin/notification-items/notification-items-admin.server";
import { invalidateNotificationItemSettingsCache } from "@/lib/notifications/notification-item-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 어드민 「알림 항목 관리」 (notification-admin-item-ssot-audit-2026-11-02 §3-2 · Owner 설계 승인 2026-11-02).
 * GET — 항목표 전체 + 어드민 설정 + 운영 30일 수치. PUT — 항목별 푸시·종 표시 저장(revision 확인, 409 면 아무것도 쓰지 않음).
 * 알림음은 기존 `/api/admin/notification-sound-ssot` 로 저장한다(항목의 소리 키).
 */
function sbOr503() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = sbOr503();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  try {
    const payload = await loadNotificationItemsAdminPayload(sb);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    console.error("[admin/notification-items] load_failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = sbOr503();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: { items?: NotificationItemSettingPatch[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const patches = Array.isArray(body.items) ? body.items : [];
  if (patches.length === 0 || patches.length > 200) {
    return NextResponse.json({ ok: false, error: "items_required" }, { status: 400 });
  }

  const result = await saveNotificationItemSettings(sb, patches, admin.userId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.item_key ? { item_key: result.item_key } : {}) },
      { status: result.status }
    );
  }
  invalidateNotificationItemSettingsCache();
  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "notification_item_settings",
    targetId: result.saved.join(","),
    action: "notification_item_settings_save",
    after: { items: patches.map((p) => ({ item_key: p.item_key, push_enabled: p.push_enabled, inbox_enabled: p.inbox_enabled })) },
  });
  const payload = await loadNotificationItemsAdminPayload(sb).catch(() => null);
  return NextResponse.json({ ok: true, saved: result.saved, ...(payload ?? {}) });
}
