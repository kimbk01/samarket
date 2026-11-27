import "server-only";

import type { SupabaseServer } from "@/lib/chat/supabase-server";
import { moimAccountCleanup } from "@/lib/moim/server/moim-rpc.server";
import { listActiveMoimMemberIds, loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

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
    const [members, moim, host] = await Promise.all([
      listActiveMoimMemberIds(sb, h.moim_id),
      loadMoimName(sb, h.moim_id),
      sb.from("moim_members").select("nickname").eq("moim_id", h.moim_id).eq("user_id", h.to_user_id).maybeSingle(),
    ]);
    await notifyMoimMany(sb, members, {
      kind: "moim_host_changed",
      moimId: h.moim_id,
      linkUrl: moimPaths.home(h.moim_id),
      dedupeRef: `account_withdrawal:${h.moim_id}:${userId}`,
      vars: { moim, name: ((host.data as { nickname?: string } | null)?.nickname ?? "").trim() },
    });
  }
  return { ok: true };
}
