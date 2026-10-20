/**
 * 거래 활동 제한 가드 (설계 v2 §C-5 · D-19) — sanctions scope='trade' 회원의 거래글 작성·수정·거래 채팅을 막는다.
 * 계정 정지(profiles.status)와 별개. 커뮤니티·배달·메신저 일반 채팅은 영향 없음.
 * 만료는 조회 시 end_at 비교 (크론 불필요). 서버 전용.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  loadActiveTradeRestriction,
  type ActiveTradeRestriction,
  type TradeActivityKind,
} from "@/lib/trade/trade-activity-restriction-core";

export {
  loadActiveTradeRestriction,
  tradeRestrictionScopesFor,
  type ActiveTradeRestriction,
  type TradeActivityKind,
} from "@/lib/trade/trade-activity-restriction-core";

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
      /** 거래 화면은 `error` 를 그대로 안내 문구로 보여 준다 — 기계 코드는 `code` */
      error: `거래 활동이 제한되어 있습니다 (${formatUntilKo(r.end_at)}). 이의신청은 고객센터에서 할 수 있습니다.`,
      code: "trade_restricted",
      restriction: r.restriction,
      end_at: r.end_at,
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
