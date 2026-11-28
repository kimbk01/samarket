/**
 * 커뮤니티 쓰기 가드 (설계 §E-6) — 활동 제한(sanctions scope='community') 회원의 글·댓글·신고를 막는다.
 * 거래·배달·메신저는 영향 없음. 만료는 조회 시 end_at 비교 (크론 불필요). 서버 전용.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type CommunityWriteKind = "post" | "comment" | "report";

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
 * (모임은 계약상 거부 — `assertCommunityWriteAllowed(..., { failClosed: true })`)
 */
export async function loadActiveCommunityRestriction(
  sb: SupabaseClient,
  userId: string,
  kind: CommunityWriteKind
): Promise<ActiveCommunityRestriction | null> {
  const r = await lookupActiveCommunityRestriction(sb, userId, kind);
  return r.ok ? r.restriction : null;
}

/** 조회 결과를 「제한 없음」과 「조회 실패」로 구분해 돌려준다 */
export async function lookupActiveCommunityRestriction(
  sb: SupabaseClient,
  userId: string,
  kind: CommunityWriteKind
): Promise<{ ok: true; restriction: ActiveCommunityRestriction | null } | { ok: false }> {
  const uid = String(userId ?? "").trim();
  if (!uid) return { ok: true, restriction: null };
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
      console.error("[community-write-restriction] lookup failed", error.message);
      return { ok: false };
    }
    const row = Array.isArray(data) ? (data[0] as ActiveCommunityRestriction | undefined) : undefined;
    return { ok: true, restriction: row ?? null };
  } catch (e) {
    console.error("[community-write-restriction] lookup threw", e instanceof Error ? e.message : e);
    return { ok: false };
  }
}

function restrictionUnavailableResponse(): NextResponse {
  return NextResponse.json({ ok: false, error: "community_restriction_unavailable" }, { status: 503 });
}

/**
 * 활동 제한 응답 — 코드만 (`docs/i18n-ssot.md` §3-3). 문구는 화면이 고른다.
 * `params.until` = 해제 시각 ISO(영구 제한이면 없음). 감사 L1: 예전 `messageKo` 한국어 문장은 내보내지 않는다.
 */
export function communityRestrictedResponse(r: ActiveCommunityRestriction): NextResponse {
  const until = r.end_at && !Number.isNaN(new Date(r.end_at).getTime()) ? r.end_at : null;
  return NextResponse.json(
    {
      ok: false,
      error: "community_restricted",
      code: "community_restricted",
      restriction: r.restriction,
      end_at: r.end_at,
      ...(until ? { params: { until } } : {}),
    },
    { status: 403 }
  );
}

/**
 * 라우트용: 제한이면 403 응답, 아니면 null.
 * sanctions 는 회원 RLS 로 읽을 수 없으므로 서비스 클라이언트로 조회한다.
 * 조회 실패·서비스 클라이언트 없음: 기본은 허용(null). `failClosed` 이면 503 으로 거부한다
 * — 모임 계약(설계 P1 「조회 실패 시 거부」 · 2026-11-27 감사 B5). 다른 호출처는 동작 그대로.
 */
export async function assertCommunityWriteAllowed(
  userId: string,
  kind: CommunityWriteKind,
  opts?: { failClosed?: boolean }
): Promise<NextResponse | null> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return opts?.failClosed ? restrictionUnavailableResponse() : null;
  const r = await lookupActiveCommunityRestriction(sb, userId, kind);
  if (!r.ok) return opts?.failClosed ? restrictionUnavailableResponse() : null;
  return r.restriction ? communityRestrictedResponse(r.restriction) : null;
}
