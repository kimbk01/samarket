/**
 * 거래 Admin DB 함수 호출 공통 (설계 v2 §G-0). 서버 전용.
 * 조치 1건 = DB 함수 1번. 함수가 돌려주는 { ok:false, error } 를 HTTP 상태로 바꾼다
 * (조치 시트 `AdminChatActionSheet` 규칙: 404 대상 없음 · 409 먼저 처리됨 · 400 입력 오류).
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";

const STATUS_BY_ERROR: Record<string, number> = {
  forbidden: 403,
  not_found: 404,
  post_not_found: 404,
  user_not_found: 404,
  already_processed: 409,
  stale_state: 409,
  not_active: 409,
  already_active_promotion: 409,
  hold_missing: 409,
  not_trade: 409,
  insufficient_balance: 409,
};

export function tradeRpcErrorStatus(code: string): number {
  return STATUS_BY_ERROR[code] ?? 400;
}

export type TradeRpcResult = { ok: true; data: Record<string, unknown> } | { ok: false; response: NextResponse };

/** DB 함수 호출 → ok 이면 결과 JSON, 아니면 바로 돌려줄 응답 */
export async function callTradeAdminRpc(
  sb: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<TradeRpcResult> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    console.error(`[trade-admin] ${fn}`, error.message);
    return { ok: false, response: NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }) };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    const code = String(r.error ?? "failed");
    return { ok: false, response: NextResponse.json({ ...r, ok: false, error: code }, { status: tradeRpcErrorStatus(code) }) };
  }
  return { ok: true, data: r };
}

/** 감사 기록용 요청 정보 (DB 함수 인자) */
export function tradeAuditMetaArgs(req: Request): { p_ip: string | null; p_user_agent: string | null } {
  const meta = getAuditRequestMeta(req);
  return { p_ip: meta.ip ?? null, p_user_agent: meta.userAgent ?? null };
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = (await req.json()) as unknown;
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 관리자 거래글 조치 후 판매자 알림 (커밋 뒤, 실패해도 조치는 유지) */
export async function notifyTradePostOwnerAfterAdminAction(
  sb: SupabaseClient,
  input: { postId: string; kind: "hidden" | "deleted" | "restored" | "edited"; reason: string; dedupeId: string }
): Promise<boolean> {
  try {
    const { notifyTradePostModerated } = await import("@/lib/notifications/notify-trade-moderation");
    const { data } = await sb.from("posts").select("user_id").eq("id", input.postId).maybeSingle();
    await notifyTradePostModerated(sb, {
      userId: (data as { user_id?: string } | null)?.user_id ?? null,
      postId: input.postId,
      kind: input.kind,
      reason: input.reason,
      dedupeId: input.dedupeId,
    });
    return true;
  } catch (e) {
    console.error("[trade-admin] notify post owner", e instanceof Error ? e.message : e);
    return false;
  }
}
