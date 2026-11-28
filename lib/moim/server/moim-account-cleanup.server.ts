import "server-only";

import type { SupabaseServer } from "@/lib/chat/supabase-server";
import { moimAccountCleanup } from "@/lib/moim/server/moim-rpc.server";
import { listActiveMoimMemberIds } from "@/lib/moim/server/moim-queries.server";
import { notifyMoimHostChanged } from "@/lib/moim/server/moim-notify.server";

/**
 * 회원 탈퇴·영구 삭제 전 모임 정리 (설계 P8 · 2026-11-27 감사 B8).
 * DB 함수 `moim_account_cleanup` 이 모임장 자동 위임(부모임장 → 운영진 → 가장 오래된 멤버) · 멤버 없으면 종료 ·
 * 모든 모임 퇴장 · 대기 신청·초대 정리를 한 트랜잭션으로 한다. 새 모임장이 생긴 모임은 전체 멤버에게 `moim_host_changed`(설계 §7).
 * 실패하면 `{ ok:false }` — 호출 라우트는 회원 삭제를 멈춘다(반쯤 처리된 상태를 남기지 않음).
 */
export async function runMoimAccountCleanup(sb: SupabaseServer, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await moimAccountCleanup(userId, sb);
  if (!r.ok) return { ok: false, error: r.error };
  for (const h of r.handovers ?? []) {
    /** R5 E16·E4: 이름은 DB 가 돌려준 모임 닉네임, 삭제 모임은 보내지 않음 (notifyMoimHostChanged 하나로) */
    if (h.moim_status === "deleted") continue;
    const members = await listActiveMoimMemberIds(sb, h.moim_id);
    await notifyMoimHostChanged(sb, h.moim_id, h.to_user_id, members, `account_withdrawal:${h.moim_id}:${userId}`, {
      ...(h.to_nickname !== undefined ? { toNickname: h.to_nickname ?? "" } : {}),
      moimStatus: h.moim_status ?? null,
    });
  }
  return { ok: true };
}
