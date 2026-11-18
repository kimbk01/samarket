import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * D2 1단계 (Owner 「D2 승인」 2026-11-19) — 쓰기 시점 카운터 비교(그림자). **화면 숫자는 바꾸지 않는다.**
 *
 * badge-count 계산(기존 로더 L)과 `member_badge_counters`(트리거 유지)를 일부 요청에서만 비교해 불일치를 기록한다.
 * 같은 자리에서 L(방 수)과 A(식별키 정규화·격리·중복 제거 후)가 갈리는지도 기록한다(하단 탭 ↔ 휴대폰 아이콘 차이 감시).
 * 비교 요청에만 Supabase 1건이 더해진다(기본 10%). 마이그레이션 적용 전이면 RPC 오류 → 조용히 건너뜀.
 *
 * 근거: docs/audit/supabase-request-surge-2026-11-18/d2-d3-d9-structure-analysis-2026-11-19.md D2
 *       supabase/migrations/20271119150000_member_badge_counters_shadow.sql
 */

export type MemberBadgeLoaderB = {
  generalDirect: number;
  group: number;
  trade: number;
  customerOrder: number;
  ownerOrder: number;
  /** A — memberConversationAuthority.totalUnreadRooms */
  authorityTotal: number;
};

export type MemberBadgeCounterRow = {
  b_general_direct: number;
  b_group: number;
  b_trade: number;
  b_customer_order: number;
  b_owner_order: number;
  version: number;
};

export const MEMBER_BADGE_COUNTER_SHADOW_DEFAULT_RATE = 0.1;

export function resolveMemberBadgeCounterShadowRate(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.SAMARKET_BADGE_COUNTER_SHADOW_RATE);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw;
  return MEMBER_BADGE_COUNTER_SHADOW_DEFAULT_RATE;
}

export type MemberBadgeShadowDiff = {
  match: boolean;
  diffs: Record<string, { loader: number; counter: number }>;
  /** L 의 회원 B 합(gd+group+trade+customer) 과 A 가 다르면 true */
  loaderVsAuthorityDiverged: boolean;
};

/** 카운터 행이 없으면 모두 0 으로 본다(트리거·백필이 안 읽은 방이 없는 사용자는 행을 만들지 않음). */
export function diffMemberBadgeCounters(
  loader: MemberBadgeLoaderB,
  row: MemberBadgeCounterRow | null
): MemberBadgeShadowDiff {
  const counter = {
    generalDirect: row?.b_general_direct ?? 0,
    group: row?.b_group ?? 0,
    trade: row?.b_trade ?? 0,
    customerOrder: row?.b_customer_order ?? 0,
    ownerOrder: row?.b_owner_order ?? 0,
  };
  const diffs: MemberBadgeShadowDiff["diffs"] = {};
  for (const k of Object.keys(counter) as Array<keyof typeof counter>) {
    if (loader[k] !== counter[k]) diffs[k] = { loader: loader[k], counter: counter[k] };
  }
  const loaderMemberB = loader.generalDirect + loader.group + loader.trade + loader.customerOrder;
  return {
    match: Object.keys(diffs).length === 0,
    diffs,
    loaderVsAuthorityDiverged: loaderMemberB !== loader.authorityTotal,
  };
}

export async function runMemberBadgeCountersShadow(
  sb: SupabaseClient,
  userId: string,
  loader: MemberBadgeLoaderB,
  opts: { rate?: number; random?: () => number } = {}
): Promise<MemberBadgeShadowDiff | null> {
  const uid = userId.trim();
  if (!uid) return null;
  const rate = opts.rate ?? resolveMemberBadgeCounterShadowRate();
  if ((opts.random ?? Math.random)() >= rate) return null;
  try {
    const { data, error } = await sb.rpc("get_member_badge_counters", { p_user_id: uid });
    if (error) return null;
    const row = (Array.isArray(data) ? data[0] : data) as MemberBadgeCounterRow | null | undefined;
    const diff = diffMemberBadgeCounters(loader, row ?? null);
    if (!diff.match || diff.loaderVsAuthorityDiverged) {
      console.warn("[badge-counter-shadow]", {
        userIdTail: uid.slice(-8),
        match: diff.match,
        diffs: diff.diffs,
        loaderVsAuthorityDiverged: diff.loaderVsAuthorityDiverged,
        authorityTotal: loader.authorityTotal,
        counterVersion: row?.version ?? null,
      });
    } else {
      console.info("[badge-counter-shadow]", { userIdTail: uid.slice(-8), match: true });
    }
    return diff;
  } catch {
    return null;
  }
}
