/**
 * Apple 결제 대사 (A-14) — DIBAY 기록과 App Store Connect 보고서를 맞춰 보는 최소 자료.
 *
 * DIBAY 가 아는 것: Apple 서명으로 확인한 거래(거래번호·구매 시각·고객 결제가·통화·국가)와 지급·환불 처리.
 * DIBAY 가 모르는 것: Apple 수수료·세금·실제 지급액(Proceeds·Payout) — App Store Connect 「Payments and Financial Reports」에만 있다.
 * 그래서 여기서는 거래 건수·고객 결제가·환불을 통화·국가별로 합계하고, 수수료·지급액은 보고서와 사람이 대조한다.
 */

export const APPLE_IAP_RECON_SELECT =
  "transaction_id, original_transaction_id, environment, purchase_date, product_id, kind, currency, storefront, price_milli, status, point_amount, cash_amount_minor, credited_at, credit_ledger_id, refund_status, refund_notified_at, refund_ledger_id, refund_reversal_ledger_id";

export type AppleIapReconRow = {
  transaction_id: string | null;
  original_transaction_id?: string | null;
  environment: string | null;
  purchase_date: string | null;
  product_id: string | null;
  kind: string | null;
  currency: string | null;
  storefront: string | null;
  price_milli: number | string | null;
  status: string | null;
  point_amount: number | string | null;
  cash_amount_minor: number | string | null;
  credited_at: string | null;
  credit_ledger_id: string | null;
  refund_status: string | null;
  refund_notified_at: string | null;
  refund_ledger_id: string | null;
  refund_reversal_ledger_id?: string | null;
};

export type AppleIapReconGroup = {
  environment: string;
  currency: string;
  storefront: string;
  /** Apple 이 결제 완료로 확인한 거래 수 */
  purchases: number;
  /** 고객 결제가 합계 (통화 단위 × 1000) — App Store Connect Sales 「Customer Price」 합과 비교 */
  customerPriceMilli: number;
  /** DIBAY 지급 완료 */
  credited: number;
  creditedPoint: number;
  creditedCashMinor: number;
  /** 결제는 확인됐으나 아직 지급 전(received) 또는 관리자 확인(review) — 재처리 대상 */
  notCredited: number;
  /** Apple 환불 알림을 받은 거래 */
  refunds: number;
  refundCustomerPriceMilli: number;
  refundReview: number;
  refundRecovered: number;
  refundWaived: number;
  refundReversed: number;
};

const PAID_STATUSES = new Set(["received", "credited", "review"]);

const n = (v: unknown) => Math.trunc(Number(v ?? 0) || 0);

/** 거래가 Apple 결제 완료로 확인된 줄인지 (준비·취소·실패 시도는 대사 대상이 아니다) */
export function isAppleIapPaidRow(r: Pick<AppleIapReconRow, "transaction_id" | "status">): boolean {
  return Boolean(String(r.transaction_id ?? "").trim()) && PAID_STATUSES.has(String(r.status ?? ""));
}

export function summarizeAppleIapRecon(rows: readonly AppleIapReconRow[]): AppleIapReconGroup[] {
  const groups = new Map<string, AppleIapReconGroup>();
  for (const r of rows) {
    if (!isAppleIapPaidRow(r)) continue;
    const environment = String(r.environment ?? "—");
    const currency = String(r.currency ?? "—");
    const storefront = String(r.storefront ?? "—");
    const key = `${environment}\u0000${currency}\u0000${storefront}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        environment,
        currency,
        storefront,
        purchases: 0,
        customerPriceMilli: 0,
        credited: 0,
        creditedPoint: 0,
        creditedCashMinor: 0,
        notCredited: 0,
        refunds: 0,
        refundCustomerPriceMilli: 0,
        refundReview: 0,
        refundRecovered: 0,
        refundWaived: 0,
        refundReversed: 0,
      };
      groups.set(key, g);
    }
    g.purchases += 1;
    g.customerPriceMilli += n(r.price_milli);
    if (r.status === "credited") {
      g.credited += 1;
      g.creditedPoint += n(r.point_amount);
      g.creditedCashMinor += n(r.cash_amount_minor);
    } else {
      g.notCredited += 1;
    }
    const rs = String(r.refund_status ?? "none");
    if (rs !== "none" || r.refund_notified_at) {
      g.refunds += 1;
      g.refundCustomerPriceMilli += n(r.price_milli);
      if (rs === "review" || rs === "reversed_review") g.refundReview += 1;
      else if (rs === "recovered") g.refundRecovered += 1;
      else if (rs === "waived") g.refundWaived += 1;
      else if (rs === "reversed") g.refundReversed += 1;
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.environment.localeCompare(b.environment) ||
      a.currency.localeCompare(b.currency) ||
      a.storefront.localeCompare(b.storefront)
  );
}

function manila(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const APPLE_IAP_RECON_CSV_HEADER = [
  "transaction_id",
  "original_transaction_id",
  "environment",
  "purchase_date_pht",
  "product_id",
  "kind",
  "storefront",
  "currency",
  "customer_price",
  "status",
  "credited_at_pht",
  "credit_ledger_id",
  "refund_status",
  "refund_notified_at_pht",
  "refund_ledger_id",
  "refund_reversal_ledger_id",
] as const;

/** 거래 1건 = 1줄 (Apple 결제 완료 줄만) — App Store Connect 거래 내역과 줄 단위로 맞춰 볼 때 */
export function appleIapReconCsv(rows: readonly AppleIapReconRow[]): string {
  const lines = [APPLE_IAP_RECON_CSV_HEADER.join(",")];
  for (const r of rows) {
    if (!isAppleIapPaidRow(r)) continue;
    lines.push(
      [
        r.transaction_id,
        r.original_transaction_id ?? "",
        r.environment,
        manila(r.purchase_date),
        r.product_id,
        r.kind,
        r.storefront,
        r.currency,
        r.price_milli == null ? "" : (n(r.price_milli) / 1000).toFixed(2),
        r.status,
        manila(r.credited_at),
        r.credit_ledger_id,
        r.refund_status,
        manila(r.refund_notified_at),
        r.refund_ledger_id,
        r.refund_reversal_ledger_id ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

/** PHT 날짜(YYYY-MM-DD) → UTC 경계 ISO. 잘못된 값은 null. `to` 는 그 날 다음 날 00:00 PHT (미포함). */
export function phtDayRange(from: string | null, to: string | null): { fromIso: string; toIso: string } | null {
  const ok = (s: string | null) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!ok(from) || !ok(to)) return null;
  const f = Date.parse(`${from}T00:00:00+08:00`);
  const t = Date.parse(`${to}T00:00:00+08:00`) + 86_400_000;
  if (!Number.isFinite(f) || !Number.isFinite(t) || t <= f || t - f > 400 * 86_400_000) return null;
  return { fromIso: new Date(f).toISOString(), toIso: new Date(t).toISOString() };
}
