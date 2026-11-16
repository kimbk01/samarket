import { describe, expect, it } from "vitest";
import {
  calculateCrewRep,
  crewRepAxisScore,
  crewRepRaterWeight,
  type CrewRepLedgerEvent,
  type CrewRepRaterContext,
} from "@/lib/trust/crew-rep-calculator";
import { CREW_REP_AXIS_WEIGHT, CREW_REP_POLICY_VERSION } from "@/lib/trust/crew-rep-policy";

const AS_OF = "2026-11-16T04:00:00.000Z";
const DAY = 86_400_000;
const daysAgo = (n: number, h = 0) => new Date(new Date(AS_OF).getTime() - n * DAY - h * 3_600_000).toISOString();

let seq = 0;
function ev(event_type: string, occurred_at: string, extra: Partial<CrewRepLedgerEvent> = {}): CrewRepLedgerEvent {
  seq += 1;
  return { id: `e${String(seq).padStart(4, "0")}`, event_type, status: "confirmed", occurred_at, ...extra };
}

const GOOD_RATER: CrewRepRaterContext = {
  accountAgeDays: 100,
  phoneVerified: true,
  score: 60,
  sharedDevice: false,
  blockedMember: false,
  suspended: false,
  givenRatings: { total: 2, bad: 0 },
  reciprocalGoodCount: 0,
};
const raters = (ids: string[], over: Partial<CrewRepRaterContext> = {}) =>
  Object.fromEntries(ids.map((id) => [id, { ...GOOD_RATER, ...over }]));

/** 축 → CREW REP 합성 (설계 §4.5 표 재현용) */
function compose(t: number, m: number, p: number, s = 0): number {
  const v =
    50 +
    CREW_REP_AXIS_WEIGHT.trade * (crewRepAxisScore(t, 0, 10) - 50) +
    CREW_REP_AXIS_WEIGHT.manner * (crewRepAxisScore(m, 0, 20) - 50) +
    CREW_REP_AXIS_WEIGHT.participation * (crewRepAxisScore(p, 0, 40) - 50) -
    s;
  return Math.round(v * 10) / 10;
}

describe("CREW REP calculator (crew_rep_v2)", () => {
  it("no events → 50, policy crew_rep_v2", () => {
    const r = calculateCrewRep({ events: [], asOf: AS_OF });
    expect(r.score).toBe(50);
    expect(r.policy_version).toBe(CREW_REP_POLICY_VERSION);
    expect(r.axis).toEqual({ trade: 50, manner: 50, participation: 50 });
  });

  it("설계 §4.5 고정 표 — 축 합성 값", () => {
    expect(compose(1, 0, 0)).toBe(52.3);
    expect(compose(5, 0, 0)).toBe(58.3);
    expect(compose(260 / 260 * 0, 0, 260)).toBe(58.7); // 글만 1년(주 상한)
    expect(compose(7.5, 0, 0)).toBe(60.7); // 부계정 5개 농사
    expect(compose(120, 22, 260)).toBe(89.6); // 최상위 2년
    // 참여만으로는 60을 넘지 못한다
    expect(compose(0, 0, 1e9)).toBeLessThanOrEqual(60);
    // 거래만으로는 75를 넘지 못한다
    expect(compose(1e9, 0, 0)).toBeLessThanOrEqual(75);
  });

  it("거래 평가 좋아요 1건(r 1.0) → 52.27", () => {
    const r = calculateCrewRep({
      events: [ev("trade_rating_good", daysAgo(3), { counterparty_id: "a" })],
      raters: raters(["a"]),
      asOf: AS_OF,
    });
    expect(r.axis.trade).toBe(54.55);
    expect(r.score).toBe(52.27);
  });

  it("거래 완료만(v1) → 점수 0, 끝난 달 상호작용으로 깨끗한 활동 월 +1", () => {
    const r = calculateCrewRep({ events: [ev("trade_completed", "2026-10-10T03:00:00.000Z")], asOf: AS_OF });
    expect(r.axis.trade).toBe(50);
    expect(r.counts.clean_months).toBe(1);
    expect(r.axis.manner).toBe(52.38);
    expect(r.score).toBe(50.71);
  });

  it("이번 달 상호작용은 깨끗한 달로 아직 인정하지 않는다", () => {
    const r = calculateCrewRep({ events: [ev("trade_completed", daysAgo(1))], asOf: AS_OF });
    expect(r.counts.clean_months).toBe(0);
    expect(r.score).toBe(50);
  });

  it("확정 위반이 있는 달은 깨끗한 달이 아니다", () => {
    const r = calculateCrewRep({
      events: [
        ev("trade_completed", "2026-10-05T03:00:00.000Z"),
        ev("manner_report_confirmed", "2026-10-20T03:00:00.000Z"),
      ],
      asOf: AS_OF,
    });
    expect(r.counts.clean_months).toBe(0);
    expect(r.axis.manner).toBeLessThan(50);
  });

  it("신고 접수(report_created) 10건 → 점수 변화 없음", () => {
    const events = Array.from({ length: 10 }, (_, i) => ev("report_created", daysAgo(i + 1)));
    const r = calculateCrewRep({ events, asOf: AS_OF });
    expect(r.score).toBe(50);
    expect(r.contributions.every((c) => c.zeroReason === "not_scored")).toBe(true);
  });

  it("같은 상대 30일 안 두 번째 평가 = 0, 평생 4번째 = 0", () => {
    const r = calculateCrewRep({
      events: [
        ev("trade_rating_good", daysAgo(150), { counterparty_id: "a" }),
        ev("trade_rating_good", daysAgo(140), { counterparty_id: "a" }),
        ev("trade_rating_good", daysAgo(100), { counterparty_id: "a" }),
        ev("trade_rating_good", daysAgo(60), { counterparty_id: "a" }),
        ev("trade_rating_good", daysAgo(20), { counterparty_id: "a" }),
      ],
      raters: raters(["a"]),
      asOf: AS_OF,
    });
    expect(
      r.contributions.filter((c) => c.eventType === "trade_rating_good").map((c) => c.zeroReason ?? "ok")
    ).toEqual([
      "ok",
      "pair_cooldown",
      "ok",
      "ok",
      "pair_lifetime",
    ]);
    expect(r.evidence.trade.pos).toBe(3);
  });

  it("평가자 가중 r: 같은 기기·가입 3일 미만·정지·차단 = 0 / 부족 1개 = 0.5 / 모름 = 0.5", () => {
    expect(crewRepRaterWeight({ ...GOOD_RATER, sharedDevice: true }, false).r).toBe(0);
    expect(crewRepRaterWeight({ ...GOOD_RATER, accountAgeDays: 2 }, false).r).toBe(0);
    expect(crewRepRaterWeight({ ...GOOD_RATER, suspended: true }, false).r).toBe(0);
    expect(crewRepRaterWeight({ ...GOOD_RATER, blockedMember: true }, false).r).toBe(0);
    expect(crewRepRaterWeight({ ...GOOD_RATER, score: 15 }, false).r).toBe(0);
    expect(crewRepRaterWeight({ ...GOOD_RATER, phoneVerified: false }, false).r).toBe(0.5);
    expect(crewRepRaterWeight({ ...GOOD_RATER, accountAgeDays: 10 }, false).r).toBe(0.5);
    expect(crewRepRaterWeight(undefined, false)).toEqual({ r: 0.5, reasons: ["rater_unknown"] });
    expect(crewRepRaterWeight(GOOD_RATER, false).r).toBe(1);
  });

  it("아쉬워요를 자주 주는 평가자의 아쉬워요 ×0.5", () => {
    const harsh = { ...GOOD_RATER, givenRatings: { total: 5, bad: 3 } };
    expect(crewRepRaterWeight(harsh, true).r).toBe(0.5);
    expect(crewRepRaterWeight(harsh, false).r).toBe(1);
  });

  it("같은 기기 부계정 좋아요 5건 → 50 그대로", () => {
    const events = ["a", "b", "c", "d", "e"].map((id, i) =>
      ev("trade_rating_good", daysAgo(10 + i), { counterparty_id: id })
    );
    const r = calculateCrewRep({ events, raters: raters(["a", "b", "c", "d", "e"], { sharedDevice: true }), asOf: AS_OF });
    expect(r.score).toBe(50);
    expect(
      r.contributions.filter((c) => c.eventType === "trade_rating_good").every((c) => c.zeroReason === "rater_weight_zero")
    ).toBe(true);
  });

  it("서로만 주고받는 고리(양방향 3회 이상, 다른 평가자 없음) ×0.25", () => {
    const events = [200, 150, 100].map((d) => ev("trade_rating_good", daysAgo(d - 30), { counterparty_id: "a" }));
    const r = calculateCrewRep({ events, raters: raters(["a"], { reciprocalGoodCount: 3 }), asOf: AS_OF });
    const ratings = r.contributions.filter((c) => c.eventType === "trade_rating_good");
    expect(ratings).toHaveLength(3);
    expect(ratings.every((c) => c.raterReasons?.includes("mutual_ring"))).toBe(true);
    expect(ratings.every((c) => c.r === 0.25)).toBe(true);
  });

  it("거래 1건 + 아쉬워요 1건(같은 r) → 거래 축 50 (오르지 않음)", () => {
    const r = calculateCrewRep({
      events: [
        ev("trade_rating_good", daysAgo(40), { counterparty_id: "a" }),
        ev("trade_rating_bad", daysAgo(5), { counterparty_id: "b" }),
      ],
      raters: raters(["a", "b"]),
      asOf: AS_OF,
    });
    expect(r.axis.trade).toBe(50);
  });

  it("기간 가중: 200일 전 = ×0.5, 400일 전 = 제외", () => {
    const r = calculateCrewRep({
      events: [
        ev("trade_rating_good", daysAgo(200), { counterparty_id: "a" }),
        ev("trade_rating_good", daysAgo(400), { counterparty_id: "b" }),
      ],
      raters: raters(["a", "b"]),
      asOf: AS_OF,
    });
    expect(r.contributions.find((c) => c.d === 0.5)?.value).toBe(0.5);
    expect(r.contributions.find((c) => c.zeroReason === "expired")).toBeTruthy();
    expect(r.evidence.trade.pos).toBe(0.5);
  });

  it("거래 확인 가중 w (metadata.trade_weight)", () => {
    const r = calculateCrewRep({
      events: [ev("trade_rating_good", daysAgo(3), { counterparty_id: "a", metadata: { trade_weight: 0.7 } })],
      raters: raters(["a"]),
      asOf: AS_OF,
    });
    expect(r.evidence.trade.pos).toBe(0.7);
  });

  it("참여도: 라운지 글 하루 2개, 주 +5 상한", () => {
    // 같은 주(월~일 PHT) 7일 × 하루 3개
    const monday = new Date("2026-11-02T02:00:00.000Z"); // 11-02 월 10:00 PHT
    const events: CrewRepLedgerEvent[] = [];
    for (let dday = 0; dday < 7; dday += 1) {
      for (let k = 0; k < 3; k += 1) {
        events.push(ev("participation_post", new Date(monday.getTime() + dday * DAY + k * 60_000).toISOString()));
      }
    }
    const r = calculateCrewRep({ events, asOf: AS_OF });
    // 하루 2개 × 0.5 = 1.0/일 → 5일째에 주 상한 5.0
    expect(r.evidence.participation.pos).toBe(5);
    expect(r.contributions.filter((c) => c.zeroReason === "daily_cap").length).toBe(5);
    // 6·7일째는 주 상한에서 먼저 막힌다(하루 3개 모두)
    expect(r.contributions.filter((c) => c.zeroReason === "weekly_cap").length).toBe(6);
  });

  it("받은 좋아요: 같은 글·같은 사람 1회, 하루 +1.0 상한, 자기 반응은 기록기에서 제외", () => {
    const events = [
      ev("participation_like_received", daysAgo(2), { counterparty_id: "a", metadata: { target_id: "post1" } }),
      ev("participation_like_received", daysAgo(2), { counterparty_id: "a", metadata: { target_id: "post1" } }),
    ];
    const r = calculateCrewRep({ events, raters: raters(["a"]), asOf: AS_OF });
    expect(r.contributions.map((c) => c.zeroReason ?? "ok")).toEqual(["ok", "duplicate_reaction"]);

    const many = Array.from({ length: 30 }, (_, i) =>
      ev("participation_like_received", daysAgo(1), { counterparty_id: `u${i}`, metadata: { target_id: "post2" } })
    );
    const ids = many.map((m) => m.counterparty_id!);
    const r2 = calculateCrewRep({ events: many, raters: raters(ids), asOf: AS_OF });
    expect(r2.evidence.participation.pos).toBe(1);
  });

  it("내 글에 달린 댓글: 글 하나당 +1.0 상한", () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      ev("participation_comment_received", daysAgo(3), { counterparty_id: `c${i}`, metadata: { target_id: "post9" } })
    );
    const r = calculateCrewRep({ events, raters: raters(events.map((e) => e.counterparty_id!)), asOf: AS_OF });
    expect(r.evidence.participation.pos).toBe(1);
  });

  it("이용 정지 중이면 최대 39, 끝난 정지는 감점만", () => {
    const good = Array.from({ length: 20 }, (_, i) =>
      ev("trade_rating_good", daysAgo(5 + i), { counterparty_id: `g${i}` })
    );
    const ids = good.map((g) => g.counterparty_id!);
    const active = calculateCrewRep({
      events: [...good, ev("sanction_suspension", daysAgo(1), { metadata: { ends_at: daysAgo(-5) } })],
      raters: raters(ids),
      asOf: AS_OF,
    });
    expect(active.sanction_active).toBe(true);
    expect(active.score).toBe(39);
    const ended = calculateCrewRep({
      events: [...good, ev("sanction_suspension", daysAgo(30), { metadata: { ends_at: daysAgo(20) } })],
      raters: raters(ids),
      asOf: AS_OF,
    });
    expect(ended.sanction_active).toBe(false);
    expect(ended.sanction_penalty).toBe(15);
    expect(ended.score).toBe(Math.round((50 + 0.5 * (crewRepAxisScore(20, 0, 10) - 50) - 15) * 100) / 100);
  });

  it("되돌린(reversed) 사건은 0", () => {
    const r = calculateCrewRep({
      events: [ev("trade_rating_bad", daysAgo(3), { counterparty_id: "a", status: "reversed" })],
      raters: raters(["a"]),
      asOf: AS_OF,
    });
    expect(r.score).toBe(50);
    expect(r.contributions[0]!.zeroReason).toBe("reversed");
  });

  it("수동 조정 합계는 ±10 으로 자른다", () => {
    const r = calculateCrewRep({
      events: [ev("manual_adjustment", daysAgo(1), { metadata: { adjustment: 25 } })],
      asOf: AS_OF,
    });
    expect(r.manual_adjustment_sum).toBe(10);
    expect(r.score).toBe(60);
  });

  it("같은 입력 → 같은 결과", () => {
    const events = [
      ev("trade_rating_good", daysAgo(3), { counterparty_id: "a" }),
      ev("participation_post", daysAgo(2)),
      ev("manner_moim_attended", daysAgo(40)),
    ];
    const a = calculateCrewRep({ events, raters: raters(["a"]), asOf: AS_OF });
    const b = calculateCrewRep({ events: [...events].reverse(), raters: raters(["a"]), asOf: AS_OF });
    expect(a).toEqual(b);
  });
});
