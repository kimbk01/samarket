/**
 * CREW REP 계산기 (crew_rep_v2) — 순수 함수. 같은 원장·평가자 정보·기준 시각 → 같은 결과.
 * 정책 값은 `crew-rep-policy.ts` 만 쓴다. 사건마다 「왜 이만큼(또는 0)인지」를 contributions 로 남긴다.
 */

import {
  CREW_REP_AXIS_K,
  CREW_REP_AXIS_WEIGHT,
  CREW_REP_CLEAN_MONTH_POINTS,
  CREW_REP_DECAY_FULL_DAYS,
  CREW_REP_DECAY_HALF_MULT,
  CREW_REP_EVENT_RULES,
  CREW_REP_MANUAL_ADJUSTMENT_CAP,
  CREW_REP_MAX,
  CREW_REP_MIN,
  CREW_REP_NEUTRAL,
  CREW_REP_PAIR_COOLDOWN_DAYS,
  CREW_REP_PAIR_LIFETIME_MAX,
  CREW_REP_PARTICIPATION_WEEKLY_CAP,
  CREW_REP_POLICY_VERSION,
  CREW_REP_RATER,
  CREW_REP_SUSPENSION_CAP,
  CREW_REP_TZ_OFFSET_MINUTES,
  CREW_REP_WINDOW_DAYS,
  type CrewRepAxis,
  type CrewRepEventRule,
} from "@/lib/trust/crew-rep-policy";

const DAY_MS = 86_400_000;

export type CrewRepLedgerEvent = {
  id: string;
  event_type: string;
  status: string;
  occurred_at: string;
  counterparty_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** 평가자(=counterparty) 상태 — 로더가 DB 에서 채운다. 모르면 넘기지 않는다(r = 0.5). */
export type CrewRepRaterContext = {
  accountAgeDays: number | null;
  phoneVerified: boolean;
  /** 평가자 현재 CREW REP (스냅샷 없으면 null) */
  score: number | null;
  /** 평가 대상 회원과 같은 기기를 쓴 적 있음 */
  sharedDevice: boolean;
  /** 평가자가 대상 회원을 차단 중 */
  blockedMember: boolean;
  /** 평가자 이용 정지 중 */
  suspended: boolean;
  /** 평가자가 남긴 거래 평가 수 / 그중 아쉬워요 */
  givenRatings: { total: number; bad: number };
  /** 대상 회원이 이 평가자에게 준 좋아요 수 (서로만 주고받는 고리 판정) */
  reciprocalGoodCount: number;
};

export type CrewRepZeroReason =
  | "not_scored"
  | "reversed"
  | "future"
  | "expired"
  | "rater_weight_zero"
  | "pair_cooldown"
  | "pair_lifetime"
  | "daily_cap"
  | "weekly_cap"
  | "per_target_cap"
  | "duplicate_reaction";

export type CrewRepContribution = {
  /** 사건 id, 깨끗한 달은 `clean_month:YYYY-MM` */
  eventId: string;
  eventType: string;
  occurredAt: string;
  axis: CrewRepEventRule["axis"] | "manner";
  sign: 1 | -1;
  base: number;
  r: number;
  w: number;
  d: number;
  /** 최종 반영값(부호 없음, 소수 4자리) */
  value: number;
  counted: boolean;
  zeroReason?: CrewRepZeroReason;
  raterReasons?: string[];
};

export type CrewRepCalculation = {
  policy_version: typeof CREW_REP_POLICY_VERSION;
  score: number;
  axis: Record<CrewRepAxis, number>;
  evidence: Record<CrewRepAxis, { pos: number; neg: number }>;
  sanction_penalty: number;
  sanction_active: boolean;
  manual_adjustment_sum: number;
  counted_event_count: number;
  unique_counterparty_count: number;
  counts: {
    trade_completed: number;
    rating_good: number;
    rating_normal: number;
    rating_bad: number;
    clean_months: number;
  };
  contributions: CrewRepContribution[];
  window_started_at: string;
  calculated_as_of: string;
};

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return CREW_REP_NEUTRAL;
  return Math.min(CREW_REP_MAX, Math.max(CREW_REP_MIN, round(n, 2)));
}

export function crewRepAxisScore(pos: number, neg: number, k: number): number {
  return CREW_REP_NEUTRAL + (CREW_REP_NEUTRAL * (pos - neg)) / (pos + neg + k);
}

/** 기간 가중 d. 음수 나이(미래)는 null. */
export function crewRepDecay(ageDays: number): number | null {
  if (ageDays < 0) return null;
  if (ageDays <= CREW_REP_DECAY_FULL_DAYS) return 1;
  if (ageDays <= CREW_REP_WINDOW_DAYS) return CREW_REP_DECAY_HALF_MULT;
  return 0;
}

function phtParts(iso: string): { day: string; month: string; week: string; monthEndMs: number } {
  const ms = new Date(iso).getTime() + CREW_REP_TZ_OFFSET_MINUTES * 60_000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = `${y}-${String(m + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const month = day.slice(0, 7);
  // 월요일 시작 주 — 그 주 월요일 날짜를 키로 쓴다.
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(y, m, d.getUTCDate() - dow));
  const week = monday.toISOString().slice(0, 10);
  // PHT 월말(다음 달 1일 00:00 PHT) 의 UTC ms
  const monthEndMs = Date.UTC(y, m + 1, 1) - CREW_REP_TZ_OFFSET_MINUTES * 60_000;
  return { day, month, week, monthEndMs };
}

/** 평가자 가중 r. */
export function crewRepRaterWeight(
  ctx: CrewRepRaterContext | undefined,
  isBadRating: boolean
): { r: number; reasons: string[] } {
  if (!ctx) return { r: CREW_REP_RATER.unknownMult, reasons: ["rater_unknown"] };
  const zero: string[] = [];
  if (ctx.accountAgeDays != null && ctx.accountAgeDays < CREW_REP_RATER.zeroMaxAccountDays) zero.push("rater_new_account");
  if (ctx.score != null && ctx.score < CREW_REP_RATER.zeroBelowScore) zero.push("rater_low_score");
  if (ctx.suspended) zero.push("rater_suspended");
  if (ctx.sharedDevice) zero.push("shared_device");
  if (ctx.blockedMember) zero.push("rater_blocked_member");
  if (zero.length) return { r: 0, reasons: zero };

  const lacks: string[] = [];
  if (ctx.accountAgeDays == null || ctx.accountAgeDays < CREW_REP_RATER.fullMinAccountDays) lacks.push("rater_account_young");
  if (!ctx.phoneVerified) lacks.push("rater_phone_unverified");
  if (ctx.score != null && ctx.score < CREW_REP_RATER.fullMinScore) lacks.push("rater_score_below_40");
  let r = lacks.length ? 0.5 : 1;
  const reasons = [...lacks];
  if (
    isBadRating &&
    ctx.givenRatings.total >= CREW_REP_RATER.harshMinRatings &&
    ctx.givenRatings.bad / ctx.givenRatings.total >= CREW_REP_RATER.harshBadRatio
  ) {
    r *= CREW_REP_RATER.harshMult;
    reasons.push("rater_harsh");
  }
  return { r, reasons };
}

function isRatingType(t: string): "good" | "normal" | "bad" | null {
  if (t === "trade_rating_good" || t === "trade_review_good") return "good";
  if (t === "trade_rating_normal" || t === "trade_review_normal") return "normal";
  if (t === "trade_rating_bad" || t === "trade_review_bad") return "bad";
  return null;
}

export function calculateCrewRep(input: {
  events: CrewRepLedgerEvent[];
  raters?: Record<string, CrewRepRaterContext>;
  asOf?: Date | string;
}): CrewRepCalculation {
  const asOfDate = input.asOf ? new Date(input.asOf) : new Date();
  const asOfMs = asOfDate.getTime();
  const asOfIso = asOfDate.toISOString();
  const raters = input.raters ?? {};

  const events = [...input.events].sort((a, b) =>
    a.occurred_at === b.occurred_at ? a.id.localeCompare(b.id) : a.occurred_at < b.occurred_at ? -1 : 1
  );

  // 서로만 주고받는 고리 판정용: 평가자별 좋아요 수 · 서로 다른 평가자 수
  const goodByRater = new Map<string, number>();
  const ratingRaters = new Set<string>();
  for (const ev of events) {
    if (ev.status !== "confirmed") continue;
    const kind = isRatingType(ev.event_type);
    if (!kind || !ev.counterparty_id) continue;
    ratingRaters.add(ev.counterparty_id);
    if (kind === "good") goodByRater.set(ev.counterparty_id, (goodByRater.get(ev.counterparty_id) ?? 0) + 1);
  }

  const evidence: Record<CrewRepAxis, { pos: number; neg: number }> = {
    trade: { pos: 0, neg: 0 },
    manner: { pos: 0, neg: 0 },
    participation: { pos: 0, neg: 0 },
  };
  let sanction = 0;
  let sanctionActive = false;
  let manual = 0;
  const contributions: CrewRepContribution[] = [];
  const counterparties = new Set<string>();
  const counts = { trade_completed: 0, rating_good: 0, rating_normal: 0, rating_bad: 0, clean_months: 0 };

  const dailyCount = new Map<string, number>();
  const dailyPoints = new Map<string, number>();
  const weeklyParticipation = new Map<string, number>();
  const perTarget = new Map<string, number>();
  const seenReaction = new Set<string>();
  const pairLast = new Map<string, number>();
  const pairCount = new Map<string, number>();
  const monthInteraction = new Set<string>();
  const monthViolation = new Set<string>();

  for (const ev of events) {
    const rule = CREW_REP_EVENT_RULES[ev.event_type];
    const occurredMs = new Date(ev.occurred_at).getTime();
    const ageDays = (asOfMs - occurredMs) / DAY_MS;
    const d = crewRepDecay(ageDays);
    const meta = (ev.metadata ?? {}) as Record<string, unknown>;
    const c: CrewRepContribution = {
      eventId: ev.id,
      eventType: ev.event_type,
      occurredAt: ev.occurred_at,
      axis: rule?.axis ?? "none",
      sign: rule?.sign ?? 1,
      base: rule?.points ?? 0,
      r: 1,
      w: 1,
      d: d ?? 0,
      value: 0,
      counted: false,
    };
    const push = (zero?: CrewRepZeroReason) => {
      if (zero) c.zeroReason = zero;
      contributions.push(c);
    };

    if (ev.status !== "confirmed") {
      push("reversed");
      continue;
    }
    if (d === null) {
      push("future");
      continue;
    }
    if (!rule) {
      push("not_scored");
      continue;
    }
    const parts = phtParts(ev.occurred_at);
    if (rule.violation && d > 0) monthViolation.add(parts.month);

    if (ev.event_type === "trade_completed") counts.trade_completed += 1;

    // 운영 수동 조정
    if (rule.axis === "ops") {
      const adj = Number(meta.adjustment);
      if (Number.isFinite(adj) && adj !== 0) {
        manual += adj;
        c.base = Math.abs(adj);
        c.sign = adj > 0 ? 1 : -1;
        c.value = round(Math.abs(adj), 4);
        c.counted = true;
        push();
      } else push("not_scored");
      continue;
    }

    // 제재 — 직접 감점, 정지 중 상한
    if (rule.axis === "sanction") {
      if (ev.event_type === "sanction_suspension") {
        const ends = typeof meta.ends_at === "string" ? new Date(meta.ends_at).getTime() : null;
        if (occurredMs <= asOfMs && (ends == null || ends > asOfMs)) sanctionActive = true;
      }
      if (d === 0) {
        push("expired");
        continue;
      }
      c.value = round(rule.points * d, 4);
      c.counted = true;
      sanction += c.value;
      push();
      continue;
    }

    if (rule.axis === "none") {
      if (rule.interaction && d > 0) monthInteraction.add(parts.month);
      push("not_scored");
      continue;
    }

    if (d === 0) {
      push("expired");
      continue;
    }

    // 평가자 가중 r
    const cp = ev.counterparty_id ?? null;
    const ratingKind = isRatingType(ev.event_type);
    let r = 1;
    if (rule.raterWeighted) {
      const rw = crewRepRaterWeight(cp ? raters[cp] : undefined, ratingKind === "bad");
      r = rw.r;
      if (rw.reasons.length) c.raterReasons = rw.reasons;
      const ctx = cp ? raters[cp] : undefined;
      if (
        ratingKind === "good" &&
        cp &&
        ctx &&
        ratingRaters.size === 1 &&
        (goodByRater.get(cp) ?? 0) >= CREW_REP_RATER.ringMinEachWay &&
        ctx.reciprocalGoodCount >= CREW_REP_RATER.ringMinEachWay
      ) {
        r *= CREW_REP_RATER.ringMult;
        c.raterReasons = [...(c.raterReasons ?? []), "mutual_ring"];
      }
    }
    c.r = r;
    const wRaw = Number(meta.trade_weight);
    const w = rule.axis === "trade" && ratingKind && Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;
    c.w = w;
    if (r === 0) {
      push("rater_weight_zero");
      continue;
    }

    // 같은 두 회원 거래 평가 30일 1회 · 평생 3회
    if (rule.pairRule && cp) {
      const n = pairCount.get(cp) ?? 0;
      if (n >= CREW_REP_PAIR_LIFETIME_MAX) {
        push("pair_lifetime");
        continue;
      }
      const last = pairLast.get(cp);
      if (last != null && occurredMs - last < CREW_REP_PAIR_COOLDOWN_DAYS * DAY_MS) {
        push("pair_cooldown");
        continue;
      }
    }

    // 같은 대상·같은 반응자 1회
    const targetId = typeof meta.target_id === "string" ? meta.target_id : null;
    if (rule.oncePerTargetCounterparty && targetId && cp) {
      const key = `${ev.event_type}:${targetId}:${cp}`;
      if (seenReaction.has(key)) {
        push("duplicate_reaction");
        continue;
      }
      seenReaction.add(key);
    }

    let earned = rule.points * r * w; // 상한 비교는 기간 가중 전 값
    const dayKey = `${ev.event_type}:${parts.day}`;
    if (rule.dailyCount != null && (dailyCount.get(dayKey) ?? 0) >= rule.dailyCount) {
      push("daily_cap");
      continue;
    }
    if (rule.dailyPoints != null) {
      const room = rule.dailyPoints - (dailyPoints.get(dayKey) ?? 0);
      if (room <= 1e-9) {
        push("daily_cap");
        continue;
      }
      earned = Math.min(earned, room);
    }
    if (rule.perTargetPoints != null && targetId) {
      const key = `${ev.event_type}:${targetId}`;
      const room = rule.perTargetPoints - (perTarget.get(key) ?? 0);
      if (room <= 1e-9) {
        push("per_target_cap");
        continue;
      }
      earned = Math.min(earned, room);
    }
    if (rule.axis === "participation") {
      const room = CREW_REP_PARTICIPATION_WEEKLY_CAP - (weeklyParticipation.get(parts.week) ?? 0);
      if (room <= 1e-9) {
        push("weekly_cap");
        continue;
      }
      earned = Math.min(earned, room);
    }

    // 반영
    dailyCount.set(dayKey, (dailyCount.get(dayKey) ?? 0) + 1);
    if (rule.dailyPoints != null) dailyPoints.set(dayKey, (dailyPoints.get(dayKey) ?? 0) + earned);
    if (rule.perTargetPoints != null && targetId) {
      const key = `${ev.event_type}:${targetId}`;
      perTarget.set(key, (perTarget.get(key) ?? 0) + earned);
    }
    if (rule.axis === "participation") {
      weeklyParticipation.set(parts.week, (weeklyParticipation.get(parts.week) ?? 0) + earned);
    }
    if (rule.pairRule && cp) {
      pairCount.set(cp, (pairCount.get(cp) ?? 0) + 1);
      pairLast.set(cp, occurredMs);
    }
    const value = earned * d;
    c.value = round(value, 4);
    c.counted = value > 0;
    if (rule.sign > 0) evidence[rule.axis].pos += value;
    else evidence[rule.axis].neg += value;
    if (cp) counterparties.add(cp);
    if (rule.interaction) monthInteraction.add(parts.month);
    if (ratingKind === "good") counts.rating_good += 1;
    else if (ratingKind === "normal") counts.rating_normal += 1;
    else if (ratingKind === "bad") counts.rating_bad += 1;
    push();
  }

  // 깨끗한 활동 월 — 끝난 달만, 상호작용 1건 이상 + 확정 위반 0
  const currentMonth = phtParts(asOfIso).month;
  for (const month of [...monthInteraction].sort()) {
    if (month >= currentMonth || monthViolation.has(month)) continue;
    const endMs = phtParts(`${month}-01T00:00:00+08:00`).monthEndMs;
    const d = crewRepDecay((asOfMs - endMs) / DAY_MS) ?? 0;
    const c: CrewRepContribution = {
      eventId: `clean_month:${month}`,
      eventType: "clean_month",
      occurredAt: new Date(endMs - 1).toISOString(),
      axis: "manner",
      sign: 1,
      base: CREW_REP_CLEAN_MONTH_POINTS,
      r: 1,
      w: 1,
      d,
      value: round(CREW_REP_CLEAN_MONTH_POINTS * d, 4),
      counted: d > 0,
    };
    if (d === 0) c.zeroReason = "expired";
    else {
      evidence.manner.pos += c.value;
      counts.clean_months += 1;
    }
    contributions.push(c);
  }

  const axis: Record<CrewRepAxis, number> = {
    trade: round(crewRepAxisScore(evidence.trade.pos, evidence.trade.neg, CREW_REP_AXIS_K.trade), 2),
    manner: round(crewRepAxisScore(evidence.manner.pos, evidence.manner.neg, CREW_REP_AXIS_K.manner), 2),
    participation: round(
      crewRepAxisScore(evidence.participation.pos, evidence.participation.neg, CREW_REP_AXIS_K.participation),
      2
    ),
  };
  const manualClamped = Math.max(-CREW_REP_MANUAL_ADJUSTMENT_CAP, Math.min(CREW_REP_MANUAL_ADJUSTMENT_CAP, manual));
  let score =
    CREW_REP_NEUTRAL +
    CREW_REP_AXIS_WEIGHT.trade * (crewRepAxisScore(evidence.trade.pos, evidence.trade.neg, CREW_REP_AXIS_K.trade) - CREW_REP_NEUTRAL) +
    CREW_REP_AXIS_WEIGHT.manner * (crewRepAxisScore(evidence.manner.pos, evidence.manner.neg, CREW_REP_AXIS_K.manner) - CREW_REP_NEUTRAL) +
    CREW_REP_AXIS_WEIGHT.participation *
      (crewRepAxisScore(evidence.participation.pos, evidence.participation.neg, CREW_REP_AXIS_K.participation) - CREW_REP_NEUTRAL) -
    sanction +
    manualClamped;
  score = clampScore(score);
  if (sanctionActive) score = Math.min(score, CREW_REP_SUSPENSION_CAP);

  const round4 = (v: { pos: number; neg: number }) => ({ pos: round(v.pos, 4), neg: round(v.neg, 4) });

  return {
    policy_version: CREW_REP_POLICY_VERSION,
    score,
    axis,
    evidence: {
      trade: round4(evidence.trade),
      manner: round4(evidence.manner),
      participation: round4(evidence.participation),
    },
    sanction_penalty: round(sanction, 2),
    sanction_active: sanctionActive,
    manual_adjustment_sum: round(manualClamped, 2),
    counted_event_count: contributions.filter((c) => c.counted).length,
    unique_counterparty_count: counterparties.size,
    counts,
    contributions,
    window_started_at: new Date(asOfMs - CREW_REP_WINDOW_DAYS * DAY_MS).toISOString(),
    calculated_as_of: asOfIso,
  };
}
