"use client";

/**
 * Point 기간 합계 — 회원 내정보 포인트·관리자 회원 상세 포인트 공용 (설계 H-6·H-7·H-8).
 * 숫자는 모두 서버 계산값(`PointPeriodSummary`·`PointChargeRequestPeriodSummary`) — 이 부품은 표시만.
 */
import { CurrencyAmount } from "@/components/currency";
import { formatMoneyPhp } from "@/lib/utils/format";
import type {
  PointChargeRequestPeriodSummary,
  PointPeriodSummary,
} from "@/lib/points/point-period-history";

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
        {pick(lang, "기간 합계를 불러오지 못했습니다.", "Could not load the period totals.")}
      </p>
    ) : null;
  }
  return (
    <section className="flex flex-col gap-2" data-testid="points-period-summary">
      <div className="grid grid-cols-2 gap-2">
        <Cell label={pick(lang, "기간 시작 잔액", "Opening balance")} amount={summary.openingBalance} sign={0} testId="pps-opening" />
        <Cell label={pick(lang, "기간 종료 잔액", "Closing balance")} amount={summary.closingBalance} sign={0} testId="pps-closing" />
        <Cell label={pick(lang, "충전", "Top-ups")} amount={summary.charge} sign={1} testId="pps-charge" />
        <Cell label={pick(lang, "지급 (이벤트·관리자)", "Granted (events·admin)")} amount={summary.grant} sign={1} testId="pps-grant" />
        <Cell label={pick(lang, "사용", "Used")} amount={summary.use} sign={-1} testId="pps-use" />
        <Cell label={pick(lang, "회수·차감", "Reclaimed·deducted")} amount={summary.reclaim} sign={-1} testId="pps-reclaim" />
        {summary.refund > 0 ? (
          <Cell label={pick(lang, "환불·환원", "Refunds·releases")} amount={summary.refund} sign={1} testId="pps-refund" />
        ) : null}
      </div>
      {summary.capped ? (
        <p className="sam-text-helper text-sam-warning" role="note">
          {pick(
            lang,
            `이 기간 내역이 ${summary.rowCount.toLocaleString("en-US")}건이라 합계는 최근 ${summary.cap.toLocaleString("en-US")}건만 반영했습니다. 기간을 줄여 주세요.`,
            `This period has ${summary.rowCount} entries; totals cover only the latest ${summary.cap}. Narrow the period.`
          )}
        </p>
      ) : summary.consistent === false ? (
        <p className="sam-text-helper text-sam-danger" role="alert" data-testid="pps-mismatch">
          {pick(lang, "내역 합계가 맞지 않습니다", "History totals do not add up")}
        </p>
      ) : null}
    </section>
  );
}

function chargeAmountText(v: { count: number; paymentAmount: number; pointAmount: number }, lang: Lang): string {
  return pick(
    lang,
    `${v.count}건 ${formatMoneyPhp(v.paymentAmount)} (${v.pointAmount.toLocaleString("en-US")}P)`,
    `${v.count} · ${formatMoneyPhp(v.paymentAmount)} (${v.pointAmount.toLocaleString("en-US")}P)`
  );
}

/** 충전 신청 기간 합계 줄 — 신청·승인·반려·대기 */
export function PointChargePeriodSummaryLine({
  summary,
  lang,
}: {
  summary: PointChargeRequestPeriodSummary;
  lang: Lang;
}) {
  const rows: Array<[string, { count: number; paymentAmount: number; pointAmount: number }]> = [
    [pick(lang, "신청", "Requested"), summary.requested],
    [pick(lang, "승인", "Approved"), summary.approved],
    [pick(lang, "반려", "Rejected"), summary.rejected],
    [pick(lang, "대기", "Pending"), summary.pending],
  ];
  if (summary.cancelled.count > 0) rows.push([pick(lang, "취소", "Cancelled"), summary.cancelled]);
  return (
    <div
      className="mb-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
      data-testid="points-charge-period-summary"
    >
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
          {pick(lang, "신청이 많아 합계는 최근 5,000건만 반영했습니다.", "Totals cover only the latest 5,000 requests.")}
        </p>
      ) : null}
    </div>
  );
}
