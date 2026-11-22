/**
 * 2026-11-22 읽음 3단계 (Owner 「LOCK 재개봉·구현 승인」) — 배지 계산기 입력 3번을 DB 함수 1번으로.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/read-mark-stage3-badge-facts-design-2026-11-22.md
 *
 * `get_member_badge_facts` 가 돌려주는 세 입력은 지금 로더와 같은 조건·정렬·상한이다:
 *   inputs          ↔ `loadMemberUnreadRoomInputs`(rpc get_member_unread_room_inputs = select *)
 *   bellRows        ↔ `loadBellExplainUnreadEventRows`
 *   ownedStoreIds   ↔ `listOwnedStoreIdsForBadge`
 * null = 함수 없음·오류 → 계산기는 지금 3번 경로로.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BellExplainEventRow } from "@/lib/notifications/bell-explain-matrix";
import type { MemberUnreadRoomInputRow } from "@/lib/notifications/member-unread-room-inputs";

export const GET_MEMBER_BADGE_FACTS_RPC = "get_member_badge_facts";

export type MemberBadgeFacts = {
  inputs: MemberUnreadRoomInputRow[];
  bellRows: BellExplainEventRow[];
  ownedStoreIds: string[];
};

/** DB 함수가 없을 때(적용 전) 매번 실패 호출하지 않게 — 이 시각까지 건너뜀 */
let missingUntilMs = 0;
const MISSING_RETRY_MS = 5 * 60_000;

export function resetMemberBadgeFactsMissingForTests(): void {
  missingUntilMs = 0;
}

export async function loadMemberBadgeFacts(
  sb: SupabaseClient,
  userId: string,
  bellLimit: number
): Promise<MemberBadgeFacts | null> {
  const uid = userId.trim();
  if (!uid) return null;
  if (Date.now() < missingUntilMs) return null;
  try {
    const { data, error } = await sb.rpc(GET_MEMBER_BADGE_FACTS_RPC, { p_user_id: uid, p_bell_limit: bellLimit });
    if (error) {
      const code = String((error as { code?: unknown }).code ?? "");
      const msg = String(error.message ?? "").toLowerCase();
      if (code === "PGRST202" || code === "42883" || msg.includes("could not find the function")) {
        missingUntilMs = Date.now() + MISSING_RETRY_MS;
      }
      return null;
    }
    const o = data as { inputs?: unknown; bell_rows?: unknown; owned_store_ids?: unknown } | null;
    if (!o || !Array.isArray(o.inputs) || !Array.isArray(o.bell_rows) || !Array.isArray(o.owned_store_ids)) return null;
    return {
      inputs: o.inputs as MemberUnreadRoomInputRow[],
      bellRows: o.bell_rows as BellExplainEventRow[],
      ownedStoreIds: (o.owned_store_ids as unknown[]).map((v) => String(v ?? "").trim()).filter(Boolean),
    };
  } catch {
    return null;
  }
}
