/**
 * 매장 신청 v2 (Owner 2026-11-10) — 새 입점 신청·보완 재제출 때 관리자 알림 1건.
 * 매장 결정 권한(`business`) 관리자에게. 실패는 outbox 재시도·로그 (신청 저장은 유지).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminNotification } from "@/lib/admin/notifications/admin-notification-service";
import { translateBy } from "@/lib/i18n/translate-by";

export async function notifyAdminsStoreApplicationSubmitted(
  sb: SupabaseClient,
  input: { storeId: string; storeName: string; kind: "submit" | "resubmit"; actorUserId: string }
): Promise<void> {
  const name = input.storeName.trim() || input.storeId;
  try {
    const r = await createAdminNotification(sb, {
      broadcastPermission: "business",
      requiredPermission: "business",
      kind: "store_application_submitted",
      severity: "info",
      // 관리자 알림 문구 = 한국어 (어드민 운영 언어 · 카탈로그 키)
      title: translateBy("ko", input.kind === "resubmit" ? "admin_store_app_notify_resubmit_title" : "admin_store_app_notify_new_title", {
        store: name,
      }),
      body: translateBy("ko", input.kind === "resubmit" ? "admin_store_app_notify_resubmit_body" : "admin_store_app_notify_new_body"),
      linkUrl: `/admin/stores?status=actionable&store=${encodeURIComponent(input.storeId)}`,
      workRef: { table: "stores", id: input.storeId },
      dedupeKey: `store_application_submitted:${input.storeId}:${input.kind}:${Date.now()}`,
      actorUserId: input.actorUserId,
      push: true,
    });
    if (!r.ok) console.error("[store_application_submitted] admin notify", input.storeId, r.error);
  } catch (err) {
    console.error("[store_application_submitted] admin notify", input.storeId, err);
  }
}
