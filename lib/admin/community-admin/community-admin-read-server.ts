/**
 * 커뮤니티 Admin 조회 API 공용 서버 도우미 (작성자·운영 기록·포인트·통계). 서버 전용.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CommunityProfileBrief = {
  id: string;
  nickname: string | null;
  username: string | null;
  dibay_id: string | null;
};

/** id 목록 → 닉네임 요약 (최대 500명, 실패 시 빈 Map — 화면은 id 로 대체 표시) */
export async function loadCommunityProfileBriefs(
  sb: SupabaseClient,
  ids: readonly (string | null | undefined)[]
): Promise<Map<string, CommunityProfileBrief>> {
  const uniq = [...new Set(ids.map((v) => String(v ?? "").trim()).filter(Boolean))].slice(0, 500);
  const out = new Map<string, CommunityProfileBrief>();
  if (!uniq.length) return out;
  const { data, error } = await sb.from("profiles").select("id, nickname, username, dibay_id").in("id", uniq);
  if (error) return out;
  for (const r of (data ?? []) as CommunityProfileBrief[]) out.set(String(r.id), r);
  return out;
}

/** RPC 미적용(마이그레이션 전) 판별 */
export function isMissingRpcError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const m = String(err.message ?? "");
  return err.code === "PGRST202" || err.code === "42883" || /could not find the function|does not exist/i.test(m);
}

export function communityReadError(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/** 기간 파서 오류 → 400 */
export function communityPeriodError(error: string) {
  return communityReadError(error, 400);
}
