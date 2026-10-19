/**
 * 커뮤니티 쓰기 가드 (설계 §E-6) — 활동 제한(sanctions scope='community') 회원의 글·댓글·신고·모임을 막는다.
 * 거래·배달·메신저는 영향 없음. 만료는 조회 시 end_at 비교 (크론 불필요). 서버 전용.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type CommunityWriteKind = "post" | "comment" | "report" | "meeting";

export type ActiveCommunityRestriction = {
  id: string;
  restriction: "post" | "comment" | "all";
  end_at: string | null;
};

/** 쓰기 종류별로 막는 제한 범위 */
export function communityRestrictionScopesFor(kind: CommunityWriteKind): Array<"post" | "comment" | "all"> {
  if (kind === "post") return ["post", "all"];
  if (kind === "comment") return ["comment", "all"];
  return ["all"];
}

/**
 * 유효한 제한 1건 또는 null.
 * 조회 오류 시: 일시 장애로 전체 회원 쓰기가 막히지 않도록 로그만 남기고 null(허용) — 의도된 선택.
 */
export async function loadActiveCommunityRestriction(
  sb: SupabaseClient,
  userId: string,
  kind: CommunityWriteKind
): Promise<ActiveCommunityRestriction | null> {
  const uid = String(userId ?? "").trim();
  if (!uid) return null;
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await sb
      .from("sanctions")
      .select("id, restriction, end_at")
      .eq("user_id", uid)
      .eq("scope", "community")
      .eq("sanction_type", "community_restriction")
      .is("revoked_at", null)
      .in("restriction", communityRestrictionScopesFor(kind))
      .or(`end_at.is.null,end_at.gt.${nowIso}`)
      .order("end_at", { ascending: false, nullsFirst: true })
      .limit(1);
    if (error) {
      console.error("[community-write-restriction] lookup failed (allowing)", error.message);
      return null;
    }
    const row = Array.isArray(data) ? (data[0] as ActiveCommunityRestriction | undefined) : undefined;
    return row ?? null;
  } catch (e) {
    console.error("[community-write-restriction] lookup threw (allowing)", e instanceof Error ? e.message : e);
    return null;
  }
}

function formatUntilKo(endAt: string | null): string {
  if (!endAt) return "영구";
  const d = new Date(endAt);
  if (Number.isNaN(d.getTime())) return "영구";
  return `${d.toLocaleString("ko-KR", { timeZone: "Asia/Manila" })}까지`;
}

export function communityRestrictedResponse(r: ActiveCommunityRestriction): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "community_restricted",
      restriction: r.restriction,
      end_at: r.end_at,
      messageKo: `커뮤니티 활동이 제한되어 있습니다 (${formatUntilKo(r.end_at)}).`,
    },
    { status: 403 }
  );
}

/**
 * 라우트용: 제한이면 403 응답, 아니면 null.
 * sanctions 는 회원 RLS 로 읽을 수 없으므로 서비스 클라이언트로 조회한다 (미설정 시 허용).
 */
export async function assertCommunityWriteAllowed(
  userId: string,
  kind: CommunityWriteKind
): Promise<NextResponse | null> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return null;
  const r = await loadActiveCommunityRestriction(sb, userId, kind);
  return r ? communityRestrictedResponse(r) : null;
}
