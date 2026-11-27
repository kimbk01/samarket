import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { authorityAllows, resolveAdminRecipientAuthority } from "@/lib/admin/notifications/admin-notification-service";
import { releaseSupportAssignmentsOnRevoke } from "@/lib/admin/admin-membership";

/**
 * 고객 문의 남은 위험 ⑤ (2026-11-27): 관리자 권한에서 「고객지원(support)」이 빠지면 그 사람이 담당하던 진행 중 문의를
 * 미배정으로 되돌린다 — 관리자 자격 해제 때와 같은 처리(`releaseSupportAssignmentsOnRevoke`).
 * 담당자가 열 수도 받을 수도 없는 문의가 남지 않게 한다. 실패는 기록만(권한 저장은 이미 끝남).
 */
export async function releaseSupportAssignmentsIfNoSupportPermission(
  sb: SupabaseClient,
  input: { userId: string; changedBy: string | null }
): Promise<void> {
  try {
    const authority = await resolveAdminRecipientAuthority(sb, input.userId);
    if (authorityAllows(authority, "support")) return;
    await releaseSupportAssignmentsOnRevoke(sb, { userId: input.userId, revokedBy: input.changedBy });
  } catch (e) {
    console.error("[support] assignee_permission_sync_failed", { userId: input.userId, error: (e as Error).message });
  }
}
