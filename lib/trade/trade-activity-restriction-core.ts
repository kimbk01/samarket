/**
 * 거래 활동 제한 조회 (설계 v2 §C-5 · D-19) — 서버 전용 모듈(`trade-activity-restriction.ts`)과
 * 메신저 송신 가드가 함께 쓰는 조회 본체. NextResponse 등 라우트 의존 없음.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TradeActivityKind = "post" | "chat";

export type ActiveTradeRestriction = {
  id: string;
  restriction: "post" | "chat" | "all";
  end_at: string | null;
};

export function tradeRestrictionScopesFor(kind: TradeActivityKind): Array<"post" | "chat" | "all"> {
  return kind === "post" ? ["post", "all"] : ["chat", "all"];
}

/**
 * 유효한 제한 1건 또는 null.
 * 조회 오류 시: 일시 장애로 전체 회원 거래가 막히지 않도록 로그만 남기고 허용 (커뮤니티 가드와 같은 선택).
 */
export async function loadActiveTradeRestriction(
  sb: SupabaseClient,
  userId: string,
  kind: TradeActivityKind
): Promise<ActiveTradeRestriction | null> {
  const uid = String(userId ?? "").trim();
  if (!uid) return null;
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await sb
      .from("sanctions")
      .select("id, restriction, end_at")
      .eq("user_id", uid)
      .eq("scope", "trade")
      .eq("sanction_type", "trade_restriction")
      .is("revoked_at", null)
      .in("restriction", tradeRestrictionScopesFor(kind))
      .or(`end_at.is.null,end_at.gt.${nowIso}`)
      .order("end_at", { ascending: false, nullsFirst: true })
      .limit(1);
    if (error) {
      console.error("[trade-activity-restriction] lookup failed (allowing)", error.message);
      return null;
    }
    const row = Array.isArray(data) ? (data[0] as ActiveTradeRestriction | undefined) : undefined;
    return row ?? null;
  } catch (e) {
    console.error("[trade-activity-restriction] lookup threw (allowing)", e instanceof Error ? e.message : e);
    return null;
  }
}
