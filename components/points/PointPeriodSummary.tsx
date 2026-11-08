"use client";

/**
 * Point 기간 합계 — 회원 내정보 포인트·관리자 회원 상세 포인트 공용 (설계 H-6·H-7·H-8).
 * 숫자는 모두 서버 계산값(`PointPeriodSummary`·`PointChargeRequestPeriodSummary`) — 이 부품은 표시만.
 */
import { CurrencyAmount } from "@/components/currency";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatMypageNumber } from "@/lib/mypage/format-mypage-date";
import type {
  PointChargeRequestPeriodSummary,
  PointPeriodSummary,
} from "@/lib/points/point-period-history";
import { translateBy } from "@/lib/i18n/translate-by";

type Lang = "ko" | "en";
const pick = (lang: Lang, ko: string, en: string) => (lang === "en" ? en : ko);

/** 「전체 N건 중 n건 표시」 */
export function pointHistoryCountLabel(total: number, shown: number, lang: Lang): string {
  const n = Math.min(shown, total);
  return pick(lang, `전체 ${total.toLocaleString("en-US")}건 중 ${n.toLocaleString("en-US")}건 표시`, `Showing ${n} of ${total}`);
}

function Cell({
  label,
  amount,
  sign,
  testId,
}: {
  label: string;
  amount: number;
  sign: 1 | -1 | 0;
  testId: string;
}) {
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2" data-testid={testId}>
      <p className="sam-text-helper text-sam-muted">{label}</p>
      <CurrencyAmount
        currency="point"
        amount={sign === 0 ? amount : sign * amount}
        compactPoint
        signed={sign !== 0}
        className="sam-text-body"
      />
    </div>
  );
}

/** 보류 칸 이름 — 순변화(보류 − 해제) 양수 = 「보류 중」, 음수 = 「보류 해제」 (D-14 ③ · 관리자 `formatAdminPointBucketLine` 과 같은 규칙) */
export function pointHoldCellLabel(hold: number, lang: Lang): string {
  return hold < 0
    ? translateBy(lang, "points_hold_released")
    : translateBy(lang, "points_on_hold_held_released");
}

export function PointPeriodSummaryCard({
  summary,
  error,
  lang,
}: {
  summary: PointPeriodSummary | null;
  error?: boolean;
  lang: Lang;
}) {
  if (!summary) {
    return error ? (
      <p className="sam-text-helper text-sam-danger" role="alert">
        {translateBy(lang, "points_could_not_load_the_period_totals")}
      </p>
    ) : null;
  }
  return (
    <section className="flex flex-col gap-2" data-testid="points-period-summary">
      <div className="grid grid-cols-2 gap-2">
        <Cell label={translateBy(lang, "points_opening_balance")} amount={summary.openingBalance} sign={0} testId="pps-opening" />
        <Cell label={translateBy(lang, "points_closing_balance")} amount={summary.closingBalance} sign={0} testId="pps-closing" />
        <Cell label={translateBy(lang, "points_top_ups")} amount={summary.charge} sign={1} testId="pps-charge" />
        <Cell label={translateBy(lang, "points_granted_events_admin")} amount={summary.grant} sign={1} testId="pps-grant" />
        <Cell label={translateBy(lang, "points_used")} amount={summary.use} sign={-1} testId="pps-use" />
        <Cell label={translateBy(lang, "points_reclaimed_deducted")} amount={summary.reclaim} sign={-1} testId="pps-reclaim" />
        {summary.refund > 0 ? (
          <Cell label={translateBy(lang, "points_refunds")} amount={summary.refund} sign={1} testId="pps-refund" />
        ) : null}
        {/* 보류 중 = 기간 안 보류 − 보류 해제 (승인 확정분은 「사용」) — 0 이면 숨김 (재감사 R3-g).
            D-14 ③ — 순변화가 음수(이전 기간 보류가 이 기간에 해제)면 「보류 중」이 아니라 「보류 해제」. 부호 = 잔액 증감 그대로. */}
        {(summary.hold ?? 0) !== 0 ? (
          <Cell
            label={pointHoldCellLabel(summary.hold, lang)}
            amount={summary.hold}
            sign={-1}
            testId="pps-hold"
          />
        ) : null}
      </div>
      {summary.capped ? (
        <p className="sam-text-helper text-sam-warning" role="note">
          {pick(
            lang,
            `이 기간 내역이 ${summary.rowCount.toLocaleString("en-US")}건이라 합계는 최근 ${summary.cap.toLocaleString("en-US")}건만 반영했습니다. 기간을 줄여 주세요.`,
            `This period has ${summary.rowCount.toLocaleString("en-US")} entries; totals cover only the latest ${summary.cap.toLocaleString("en-US")}. Narrow the period.`
          )}
        </p>
      ) : summary.consistent === false ? (
        <p className="sam-text-helper text-sam-danger" role="alert" data-testid="pps-mismatch">
          {translateBy(lang, "points_history_totals_do_not_add_up")}
        </p>
      ) : null}
    </section>
  );
}

function chargeAmountText(v: { count: number; paymentAmount: number; pointAmount: number }, lang: Lang): string {
  return pick(
    lang,
    `${v.count}건 ${formatMoneyPhp(v.paymentAmount)} (${formatMypageNumber(v.pointAmount)}P)`,
    `${v.count} · ${formatMoneyPhp(v.paymentAmount)} (${formatMypageNumber(v.pointAmount)}P)`
  );
}

/** 충전 신청 기간 합계 줄 — 신청·승인·반려·대기 (신청일 기준 · 재감사 M-12) */
export function PointChargePeriodSummaryLine({
  summary,
  lang,
  audience = "admin",
}: {
  summary: PointChargeRequestPeriodSummary;
  lang: Lang;
  /**
   * 회원 화면은 이 칸(입금 대기·확인 중·보류 합)을 「처리 대기(보류 포함)」로 — 「대기 n」(취소 가능 대기 건 · D19)과
   * 같은 이름의 다른 숫자가 되지 않게 (D-14 ②). 관리자 회원 상세는 이름 그대로.
   */
  audience?: "member" | "admin";
}) {
  const pendingLabel =
    audience === "member"
      ? translateBy(lang, "points_awaiting_processing_incl_on_hold")
      : translateBy(lang, "points_pending");
  const rows: Array<[string, { count: number; paymentAmount: number; pointAmount: number }]> = [
    [translateBy(lang, "points_requested"), summary.requested],
    [translateBy(lang, "points_approved"), summary.approved],
    [translateBy(lang, "points_rejected"), summary.rejected],
    [pendingLabel, summary.pending],
  ];
  if (summary.cancelled.count > 0) rows.push([translateBy(lang, "points_cancelled"), summary.cancelled]);
  return (
    <div
      className="mb-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
      data-testid="points-charge-period-summary"
    >
      <p className="mb-1 sam-text-xxs text-sam-muted" data-testid="points-charge-summary-basis">
        {translateBy(lang, "points_by_request_date")}
      </p>
      <dl className="grid grid-cols-1 gap-1 sam-text-helper">
        {rows.map(([label, v]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-sam-muted">{label}</dt>
            <dd className="text-right text-sam-fg">{chargeAmountText(v, lang)}</dd>
          </div>
        ))}
      </dl>
      {summary.capped ? (
        <p className="mt-1 sam-text-helper text-sam-warning" role="note">
          {pick(
            lang,
            `신청이 많아 합계는 최근 ${(summary.cap ?? 50_000).toLocaleString("en-US")}건만 반영했습니다.`,
            `Totals cover only the latest ${(summary.cap ?? 50_000).toLocaleString("en-US")} requests.`
          )}
        </p>
      ) : null}
    </div>
  );
}
