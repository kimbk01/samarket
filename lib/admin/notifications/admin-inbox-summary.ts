/**
 * 관리자 받은 알림 요약(헤더 아이콘 숫자) — `/api/admin/inbox?summary=1` 과 `/api/admin/admin-bell?with_inbox=1` 이 같이 쓴다.
 * 2026-11-22 관리자 폴링 한 요청으로 · 설계: docs/audit/supabase-request-surge-2026-11-18/admin-inbox-bell-polling-design-2026-11-22.md
 * 계산·권한 조건은 이전 inbox summary 와 같다(전달 상태는 최고 관리자만).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminApiActor } from "@/lib/admin/require-admin-permission";
import {
  countUnreadAdminNotifications,
  loadAdminNotificationDeliveryHealth,
  type AdminRecipientAuthority,
} from "@/lib/admin/notifications/admin-notification-service";

export type AdminInboxSummary =
  | { ok: true; unread: number; delivery?: unknown }
  | { ok: false; error: string };

export async function loadAdminInboxSummary(
  sb: SupabaseClient,
  actor: Pick<AdminApiActor, "userId" | "isSuperAdmin" | "permissions">
): Promise<AdminInboxSummary> {
  const authority: AdminRecipientAuthority = {
    active: true,
    isSuperAdmin: actor.isSuperAdmin,
    permissions: actor.permissions,
  };
  const r = await countUnreadAdminNotifications(sb, { adminUserId: actor.userId, authority });
  if (!r.ok) return { ok: false, error: r.error };
  // Delivery health (dead letters / backlog) is an operational surface — super admins only.
  let delivery: unknown = undefined;
  if (actor.isSuperAdmin) {
    const h = await loadAdminNotificationDeliveryHealth(sb);
    delivery = h.ok ? h.health : { unavailable: true };
  }
  return { ok: true, unread: r.unread, ...(delivery !== undefined ? { delivery } : {}) };
}
