/**
 * CREW REP 읽기 — S6 (설계 §4.6·§4.7).
 * - 내 상세: 점수·축·90일 점수 이력·반영된 기록(사건별 반영값·0 처리 사유). 상대 회원 id 는 내보내지 않는다.
 * - 상대 공개 요약: 점수·축·거래 평가 집계·약속 요약. 개별 내역·날짜·평가자는 내보내지 않는다.
 * 점수 권한 = member_trust_snapshots (S2 계산기 결과). 서버(service role)만 읽는다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrewRepContribution } from "@/lib/trust/crew-rep-calculator";
import { loadTradeRatingSummary, type TradeRatingSummary } from "@/lib/trade/trade-rating";

type Sb = SupabaseClient<any>;
const DAY_MS = 86_400_000;

/** 확인된 기록 3건 미만 또는 서로 다른 상대 2명 미만 = 「새 크루」 (설계 §4.4-6) */
export const CREW_REP_NEW_CREW_MIN_EVENTS = 3;
export const CREW_REP_NEW_CREW_MIN_COUNTERPARTIES = 2;

type SnapshotRow = {
  manner_battery_percent: number | null;
  axis_trade: number | null;
  axis_manner: number | null;
  axis_participation: number | null;
  sanction_penalty: number | null;
  sanction_active: boolean | null;
  eligible_event_count: number | null;
  unique_counterparty_count: number | null;
  calculated_at: string | null;
  policy_version: string | null;
  metadata: { contributions?: CrewRepContribution[]; clean_months?: number } | null;
};

export type CrewRepAxes = { trade: number; manner: number; participation: number; sanction: number };

export type CrewRepContributionView = {
  eventType: string;
  axis: string;
  sign: 1 | -1;
  value: number;
  counted: boolean;
  zeroReason: string | null;
  raterReasons: string[];
  occurredAt: string;
};

export type CrewRepMemberDetail = {
  score: number;
  axes: CrewRepAxes;
  newCrew: boolean;
  calculatedAt: string | null;
  history: { at: string; before: number | null; after: number; cause: string }[];
  contributions: CrewRepContributionView[];
};

export type CrewRepPublicSummary = {
  score: number;
  axes: Omit<CrewRepAxes, "sanction">;
  newCrew: boolean;
  trade: TradeRatingSummary;
  manner: { cleanMonths: number; moimAttended: number; moimNoShow: number; confirmedReports: number };
};

const num = (v: unknown, d: number) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d);

async function loadSnapshot(sb: Sb, memberId: string): Promise<SnapshotRow | null> {
  const { data, error } = await sb
    .from("member_trust_snapshots")
    .select(
      "manner_battery_percent, axis_trade, axis_manner, axis_participation, sanction_penalty, sanction_active, eligible_event_count, unique_counterparty_count, calculated_at, policy_version, metadata"
    )
    .eq("member_id", memberId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SnapshotRow | null) ?? null;
}

function isNewCrew(s: SnapshotRow | null): boolean {
  if (!s) return true;
  return (
    num(s.eligible_event_count, 0) < CREW_REP_NEW_CREW_MIN_EVENTS ||
    num(s.unique_counterparty_count, 0) < CREW_REP_NEW_CREW_MIN_COUNTERPARTIES
  );
}

function axesOf(s: SnapshotRow | null): CrewRepAxes {
  return {
    trade: num(s?.axis_trade, 50),
    manner: num(s?.axis_manner, 50),
    participation: num(s?.axis_participation, 50),
    sanction: num(s?.sanction_penalty, 0),
  };
}

/** 사건별 반영 내역 — 화면용(순수 함수). 최신순, 최대 limit 건. */
export function toContributionViews(list: CrewRepContribution[] | undefined, limit = 60): CrewRepContributionView[] {
  return [...(list ?? [])]
    .filter((c) => c.zeroReason !== "not_scored" || c.eventType === "trade_completed")
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
    .slice(0, limit)
    .map((c) => ({
      eventType: c.eventType,
      axis: String(c.axis),
      sign: c.sign,
      value: Math.round(c.value * 100) / 100,
      counted: c.counted,
      zeroReason: c.zeroReason ?? null,
      raterReasons: c.raterReasons ?? [],
      occurredAt: c.occurredAt,
    }));
}

export async function loadCrewRepMemberDetail(sb: Sb, memberId: string, now: Date = new Date()): Promise<CrewRepMemberDetail> {
  const since = new Date(now.getTime() - 90 * DAY_MS).toISOString();
  const [snap, hist, before] = await Promise.all([
    loadSnapshot(sb, memberId),
    sb
      .from("member_trust_score_history")
      .select("score_before, score_after, cause, created_at")
      .eq("member_id", memberId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(200),
    // 90일 이전 마지막 점수 — 그래프 시작점
    sb
      .from("member_trust_score_history")
      .select("score_after, created_at")
      .eq("member_id", memberId)
      .lt("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (hist.error) throw new Error(hist.error.message);
  const rows = (hist.data ?? []) as { score_before: number | null; score_after: number; cause: string; created_at: string }[];
  const start = ((before.data ?? []) as { score_after: number }[])[0];
  const history = [
    ...(start ? [{ at: since, before: null, after: num(start.score_after, 50), cause: "carry" }] : []),
    ...rows.map((r) => ({ at: r.created_at, before: r.score_before != null ? Number(r.score_before) : null, after: Number(r.score_after), cause: r.cause })),
  ];
  return {
    score: num(snap?.manner_battery_percent, 50),
    axes: axesOf(snap),
    newCrew: isNewCrew(snap),
    calculatedAt: snap?.calculated_at ?? null,
    history,
    contributions: toContributionViews(snap?.metadata?.contributions),
  };
}

/** 상대 공개 요약에 쓰는 약속 집계 (순수 함수) — 반영된 것만 센다. */
export function summarizeMannerForPublic(list: CrewRepContribution[] | undefined): CrewRepPublicSummary["manner"] {
  const counted = (list ?? []).filter((c) => c.counted);
  return {
    cleanMonths: counted.filter((c) => c.eventType === "clean_month").length,
    moimAttended: counted.filter((c) => c.eventType === "manner_moim_attended").length,
    moimNoShow: counted.filter((c) => c.eventType === "manner_moim_no_show").length,
    confirmedReports: counted.filter((c) => c.eventType === "manner_report_confirmed").length,
  };
}

export async function loadCrewRepPublicSummary(sb: Sb, memberId: string, now: Date = new Date()): Promise<CrewRepPublicSummary> {
  const [snap, trade] = await Promise.all([loadSnapshot(sb, memberId), loadTradeRatingSummary(sb, memberId, now)]);
  const axes = axesOf(snap);
  return {
    score: num(snap?.manner_battery_percent, 50),
    axes: { trade: axes.trade, manner: axes.manner, participation: axes.participation },
    newCrew: isNewCrew(snap),
    trade,
    manner: summarizeMannerForPublic(snap?.metadata?.contributions),
  };
}
