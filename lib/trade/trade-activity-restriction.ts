/**
 * 거래 활동 제한 가드 (설계 v2 §C-5 · D-19) — sanctions scope='trade' 회원의 거래글 작성·수정·거래 채팅을 막는다.
 * 계정 정지(profiles.status)와 별개. 커뮤니티·배달·메신저 일반 채팅은 영향 없음.
 * 만료는 조회 시 end_at 비교 (크론 불필요). 서버 전용.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

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

function formatUntilKo(endAt: string | null): string {
  if (!endAt) return "별도 안내 시까지";
  const d = new Date(endAt);
  if (Number.isNaN(d.getTime())) return "별도 안내 시까지";
  return `${d.toLocaleString("ko-KR", { timeZone: "Asia/Manila" })}까지`;
}

export function tradeRestrictedResponse(r: ActiveTradeRestriction): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "trade_restricted",
      restriction: r.restriction,
      end_at: r.end_at,
      messageKo: `거래 활동이 제한되어 있습니다 (${formatUntilKo(r.end_at)}). 이의신청은 고객센터에서 할 수 있습니다.`,
    },
    { status: 403 }
  );
}

/** 라우트용: 제한이면 403 응답, 아니면 null. */
export async function assertTradeActivityAllowed(
  userId: string,
  kind: TradeActivityKind,
  sb?: SupabaseClient | null
): Promise<NextResponse | null> {
  const client = sb ?? tryCreateSupabaseServiceClient();
  if (!client) return null;
  const r = await loadActiveTradeRestriction(client, userId, kind);
  return r ? tradeRestrictedResponse(r) : null;
}
