/**
 * Settlement operator aggregation — presentation over canonical store_settlements rows.
 * No new aggregate table. Fee/amount fields must come from ledger columns (no recalculation).
 */

export type SettlementOpsRowLike = {
  id: string;
  store_id: string;
  store_name?: string | null;
  order_id: string;
  order_no?: string | null;
  gross_amount: number;
  platform_fee_amount?: number | null;
  fixed_fee_amount?: number | null;
  refund_amount?: number | null;
  commission_reversal_amount?: number | null;
  net_settlement_amount?: number | null;
  settlement_amount: number;
  settlement_status: string;
  settlement_due_date?: string | null;
  paid_at?: string | null;
  hold_reason?: string | null;
  created_at: string;
};

export type SettlementOpsBucket =
  | "problem"
  | "needs_action"
  | "scheduled"
  | "processing"
  | "paid"
  | "cancelled"
  | "other";

export type SettlementDailyGroup = {
  settlementDay: string;
  storeId: string;
  storeName: string;
  orderCount: number;
  gross: number;
  platformFee: number;
  refund: number;
  adjustment: number;
  net: number;
  pendingNet: number;
  paidNet: number;
  problemCount: number;
  needsActionCount: number;
  earliestDue: string | null;
  latestPaidAt: string | null;
  primaryStatus: SettlementOpsBucket;
  rowIds: string[];
};

export type SettlementStoreGroup = {
  storeId: string;
  storeName: string;
  orderCount: number;
  gross: number;
  platformFee: number;
  refund: number;
  adjustment: number;
  net: number;
  pendingNet: number;
  paidNet: number;
  problemCount: number;
  needsActionCount: number;
  periodFrom: string | null;
  periodTo: string | null;
  primaryStatus: SettlementOpsBucket;
  rowIds: string[];
};

export type SettlementOpsSummary = {
  orderCount: number;
  gross: number;
  platformFee: number;
  refund: number;
  adjustment: number;
  pendingNet: number;
  paidNet: number;
  needsActionCount: number;
  problemCount: number;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function settlementPlatformFee(row: SettlementOpsRowLike): number {
  return n(row.platform_fee_amount) + n(row.fixed_fee_amount);
}

export function settlementNet(row: SettlementOpsRowLike): number {
  return n(row.net_settlement_amount ?? row.settlement_amount);
}

export function settlementDayKey(iso: string | null | undefined): string {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}

export function classifySettlementOpsBucket(status: string, holdReason?: string | null): SettlementOpsBucket {
  const s = String(status ?? "").trim();
  if (s === "held" || (holdReason && s !== "paid" && s !== "cancelled")) return "problem";
  if (s === "scheduled") return "needs_action";
  if (s === "processing") return "processing";
  if (s === "paid") return "paid";
  if (s === "cancelled") return "cancelled";
  return "other";
}

export function settlementOpsBucketLabel(bucket: SettlementOpsBucket, ko: boolean): string {
  switch (bucket) {
    case "problem":
      return ko ? "문제/보류" : "Problem / hold";
    case "needs_action":
      return ko ? "처리 필요" : "Needs action";
    case "scheduled":
      return ko ? "예정" : "Scheduled";
    case "processing":
      return ko ? "지급 준비" : "Processing";
    case "paid":
      return ko ? "완료" : "Paid";
    case "cancelled":
      return ko ? "취소" : "Cancelled";
    default:
      return ko ? "기타" : "Other";
  }
}

/** Sort: problem → needs_action → processing → due date → newest created */
export function sortSettlementOpsRows<T extends SettlementOpsRowLike>(rows: T[]): T[] {
  const rank = (r: T): number => {
    const b = classifySettlementOpsBucket(r.settlement_status, r.hold_reason);
    if (b === "problem") return 0;
    if (b === "needs_action") return 1;
    if (b === "processing") return 2;
    if (b === "scheduled") return 3;
    if (b === "paid") return 5;
    if (b === "cancelled") return 6;
    return 4;
  };
  return [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const da = String(a.settlement_due_date ?? "");
    const db = String(b.settlement_due_date ?? "");
    if (da !== db) return da.localeCompare(db);
    return String(b.created_at).localeCompare(String(a.created_at));
  });
}

export function summarizeSettlementOps(rows: SettlementOpsRowLike[]): SettlementOpsSummary {
  let gross = 0;
  let platformFee = 0;
  let refund = 0;
  let adjustment = 0;
  let pendingNet = 0;
  let paidNet = 0;
  let needsActionCount = 0;
  let problemCount = 0;
  for (const r of rows) {
    gross += n(r.gross_amount);
    platformFee += settlementPlatformFee(r);
    refund += n(r.refund_amount);
    adjustment += n(r.commission_reversal_amount);
    const net = settlementNet(r);
    const bucket = classifySettlementOpsBucket(r.settlement_status, r.hold_reason);
    if (bucket === "paid") paidNet += net;
    else if (bucket !== "cancelled") pendingNet += net;
    if (bucket === "needs_action" || bucket === "processing") needsActionCount += 1;
    if (bucket === "problem") problemCount += 1;
  }
  return {
    orderCount: rows.length,
    gross,
    platformFee,
    refund,
    adjustment,
    pendingNet,
    paidNet,
    needsActionCount,
    problemCount,
  };
}

function primaryBucket(counts: Record<SettlementOpsBucket, number>): SettlementOpsBucket {
  const order: SettlementOpsBucket[] = [
    "problem",
    "needs_action",
    "processing",
    "scheduled",
    "paid",
    "cancelled",
    "other",
  ];
  for (const b of order) {
    if ((counts[b] ?? 0) > 0) return b;
  }
  return "other";
}

export function groupSettlementsByDayStore(rows: SettlementOpsRowLike[]): SettlementDailyGroup[] {
  const map = new Map<string, SettlementDailyGroup & { _counts: Record<SettlementOpsBucket, number> }>();
  for (const r of rows) {
    const day = settlementDayKey(r.created_at);
    const key = `${day}::${r.store_id}`;
    let g = map.get(key);
    if (!g) {
      g = {
        settlementDay: day,
        storeId: r.store_id,
        storeName: String(r.store_name ?? "").trim() || "—",
        orderCount: 0,
        gross: 0,
        platformFee: 0,
        refund: 0,
        adjustment: 0,
        net: 0,
        pendingNet: 0,
        paidNet: 0,
        problemCount: 0,
        needsActionCount: 0,
        earliestDue: null,
        latestPaidAt: null,
        primaryStatus: "other",
        rowIds: [],
        _counts: {
          problem: 0,
          needs_action: 0,
          scheduled: 0,
          processing: 0,
          paid: 0,
          cancelled: 0,
          other: 0,
        },
      };
      map.set(key, g);
    }
    const bucket = classifySettlementOpsBucket(r.settlement_status, r.hold_reason);
    const net = settlementNet(r);
    g.orderCount += 1;
    g.gross += n(r.gross_amount);
    g.platformFee += settlementPlatformFee(r);
    g.refund += n(r.refund_amount);
    g.adjustment += n(r.commission_reversal_amount);
    g.net += net;
    if (bucket === "paid") g.paidNet += net;
    else if (bucket !== "cancelled") g.pendingNet += net;
    if (bucket === "problem") g.problemCount += 1;
    if (bucket === "needs_action" || bucket === "processing") g.needsActionCount += 1;
    g._counts[bucket] = (g._counts[bucket] ?? 0) + 1;
    g.rowIds.push(r.id);
    const due = r.settlement_due_date ? String(r.settlement_due_date).slice(0, 10) : null;
    if (due && (!g.earliestDue || due < g.earliestDue)) g.earliestDue = due;
    if (r.paid_at) {
      const p = String(r.paid_at);
      if (!g.latestPaidAt || p > g.latestPaidAt) g.latestPaidAt = p;
    }
    if (!g.storeName || g.storeName === "—") {
      const nm = String(r.store_name ?? "").trim();
      if (nm) g.storeName = nm;
    }
  }
  const out: SettlementDailyGroup[] = [];
  for (const g of map.values()) {
    g.primaryStatus = primaryBucket(g._counts);
    const { _counts: _, ...rest } = g;
    out.push(rest);
  }
  return out.sort((a, b) => {
    const ra =
      a.problemCount > 0 ? 0 : a.needsActionCount > 0 ? 1 : a.primaryStatus === "processing" ? 2 : 3;
    const rb =
      b.problemCount > 0 ? 0 : b.needsActionCount > 0 ? 1 : b.primaryStatus === "processing" ? 2 : 3;
    if (ra !== rb) return ra - rb;
    const da = a.earliestDue ?? "9999";
    const db = b.earliestDue ?? "9999";
    if (da !== db) return da.localeCompare(db);
    return b.settlementDay.localeCompare(a.settlementDay);
  });
}

export function groupSettlementsByStore(rows: SettlementOpsRowLike[]): SettlementStoreGroup[] {
  const map = new Map<string, SettlementStoreGroup & { _counts: Record<SettlementOpsBucket, number> }>();
  for (const r of rows) {
    let g = map.get(r.store_id);
    if (!g) {
      g = {
        storeId: r.store_id,
        storeName: String(r.store_name ?? "").trim() || "—",
        orderCount: 0,
        gross: 0,
        platformFee: 0,
        refund: 0,
        adjustment: 0,
        net: 0,
        pendingNet: 0,
        paidNet: 0,
        problemCount: 0,
        needsActionCount: 0,
        periodFrom: null,
        periodTo: null,
        primaryStatus: "other",
        rowIds: [],
        _counts: {
          problem: 0,
          needs_action: 0,
          scheduled: 0,
          processing: 0,
          paid: 0,
          cancelled: 0,
          other: 0,
        },
      };
      map.set(r.store_id, g);
    }
    const bucket = classifySettlementOpsBucket(r.settlement_status, r.hold_reason);
    const net = settlementNet(r);
    const day = settlementDayKey(r.created_at);
    g.orderCount += 1;
    g.gross += n(r.gross_amount);
    g.platformFee += settlementPlatformFee(r);
    g.refund += n(r.refund_amount);
    g.adjustment += n(r.commission_reversal_amount);
    g.net += net;
    if (bucket === "paid") g.paidNet += net;
    else if (bucket !== "cancelled") g.pendingNet += net;
    if (bucket === "problem") g.problemCount += 1;
    if (bucket === "needs_action" || bucket === "processing") g.needsActionCount += 1;
    g._counts[bucket] = (g._counts[bucket] ?? 0) + 1;
    g.rowIds.push(r.id);
    if (!g.periodFrom || day < g.periodFrom) g.periodFrom = day;
    if (!g.periodTo || day > g.periodTo) g.periodTo = day;
    if (!g.storeName || g.storeName === "—") {
      const nm = String(r.store_name ?? "").trim();
      if (nm) g.storeName = nm;
    }
  }
  const out: SettlementStoreGroup[] = [];
  for (const g of map.values()) {
    g.primaryStatus = primaryBucket(g._counts);
    const { _counts: _, ...rest } = g;
    out.push(rest);
  }
  return out.sort((a, b) => {
    const ra = a.problemCount > 0 ? 0 : a.needsActionCount > 0 ? 1 : 2;
    const rb = b.problemCount > 0 ? 0 : b.needsActionCount > 0 ? 1 : 2;
    if (ra !== rb) return ra - rb;
    return b.net - a.net;
  });
}

export function utcDayBounds(daysAgoStart: number, daysAgoEnd = daysAgoStart): { from: string; to: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgoStart));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgoEnd));
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return { from: fmt(start), to: fmt(end) };
}

export function thisUtcWeekBounds(): { from: string; to: string } {
  const now = new Date();
  const dow = now.getUTCDay(); // 0 Sun
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  return utcDayBounds(mondayOffset, 0);
}
