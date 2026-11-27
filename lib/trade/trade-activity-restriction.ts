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

/** 제한 끝 시각 — 언어와 무관한 표기(PHT `YYYY-MM-DD HH:mm`). 화면 문구는 키 `reaudit_trade_restricted_until` */
function formatRestrictionUntil(endAt: string | null): string | null {
  if (!endAt) return null;
  const d = new Date(endAt);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function tradeRestrictedResponse(r: ActiveTradeRestriction): NextResponse {
  const until = formatRestrictionUntil(r.end_at);
  /** 화면은 코드로 문구를 고른다(`lib/trade/trade-api-error-text.ts`) — 서버 문장 없음 */
  const code = until ? "trade_restricted_until" : "trade_restricted";
  return NextResponse.json(
    {
      ok: false,
      error: code,
      code,
      ...(until ? { params: { until } } : {}),
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
