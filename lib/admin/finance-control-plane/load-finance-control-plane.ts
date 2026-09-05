/**
 * ARO-OPS-UX-002-B4 — Common Finance Control Plane loader.
 * Composes Point/Coin/Cash/Settlement/Obligation sources. No new tables/mutations.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUSINESS_CASH_CHARGE_REQUESTS_TABLE,
  BUSINESS_CASH_LEDGER_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import { USER_CHARGE_ACTIONABLE_STATUSES } from "@/lib/admin/admin-action-queue";
import { businessCcFinancialStatementHref } from "@/lib/admin-business/business-control-center-links";
import { COIN_WITHDRAWAL_REQUESTS_TABLE } from "@/lib/currency/coin-withdrawal-writer";
import type {
  FinanceActionItem,
  FinanceControlPlaneModel,
  FinanceSectionRow,
} from "@/lib/admin/finance-control-plane/types";

function ageHours(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 3600000));
}

function phpMajor(n: number): string {
  return `₱${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function cashMinorLabel(minor: number): string {
  return phpMajor(Math.trunc(minor) / 100);
}

function memberHref(userId: string): string {
  return `/admin/users/${encodeURIComponent(userId)}`;
}

function pointChargeHref(id: string): string {
  return `/admin/point-charges/${encodeURIComponent(id)}`;
}

function isMissing(err: { message?: string } | null | undefined, re: RegExp): boolean {
  return !!err && re.test(String(err.message ?? ""));
}

function isPointActionable(status: string): boolean {
  const s = status.trim().toLowerCase();
  return (USER_CHARGE_ACTIONABLE_STATUSES as readonly string[]).includes(s);
}

export async function loadFinanceControlPlane(
  sb: SupabaseClient
): Promise<FinanceControlPlaneModel> {
  const sectionErrors: string[] = [];

  const [
    pointRes,
    cashPendingRes,
    coinWithdrawRes,
    settlementRes,
    obligationRes,
    coinLedgerRes,
    cashLedgerRes,
  ] = await Promise.all([
    sb
      .from("point_charge_requests")
      .select(
        "id, user_id, point_amount, payment_amount, request_status, requested_at, processed_at, applied_rate"
      )
      .order("requested_at", { ascending: false })
      .limit(80),
    sb
      .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
      .select("id, store_id, owner_user_id, amount_minor, status, created_at, decided_at")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(40),
    sb
      .from(COIN_WITHDRAWAL_REQUESTS_TABLE)
      .select(
        "id, store_id, owner_user_id, amount, status, created_at, paid_at, source_kind"
      )
      .eq("status", "REQUESTED")
      .order("created_at", { ascending: false })
      .limit(40),
    sb
      .from("store_settlements")
      .select(
        "id, store_id, order_id, gross_amount, platform_fee_amount, fixed_fee_amount, net_settlement_amount, settlement_amount, settlement_status, created_at, paid_at"
      )
      .in("settlement_status", ["scheduled", "held", "processing"])
      .order("created_at", { ascending: false })
      .limit(40),
    sb
      .from("store_sale_fee_obligations")
      .select(
        "id, store_id, order_id, fee_due_minor, fee_paid_minor, fee_outstanding_minor, status, created_at, settled_at"
      )
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(40),
    sb
      .from(STORE_ECONOMIC_POINT_LEDGER_TABLE)
      .select("id, store_id, entry_kind, amount, related_type, related_id, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
    sb
      .from(BUSINESS_CASH_LEDGER_TABLE)
      .select(
        "id, store_id, entry_kind, direction, amount_minor, related_type, related_id, meta, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  if (pointRes.error && !isMissing(pointRes.error, /point_charge_requests|schema cache|does not exist/i)) {
    sectionErrors.push(`point:${pointRes.error.message}`);
  }
  if (
    cashPendingRes.error &&
    !isMissing(cashPendingRes.error, /business_cash_charge_requests|schema cache|does not exist/i)
  ) {
    sectionErrors.push(`cash:${cashPendingRes.error.message}`);
  }
  if (
    coinWithdrawRes.error &&
    !isMissing(coinWithdrawRes.error, /coin_withdrawal_requests|schema cache|does not exist/i)
  ) {
    sectionErrors.push(`coin_withdraw:${coinWithdrawRes.error.message}`);
  }
  if (settlementRes.error && !isMissing(settlementRes.error, /store_settlements|schema cache|does not exist/i)) {
    sectionErrors.push(`settlement:${settlementRes.error.message}`);
  }
  if (
    obligationRes.error &&
    !isMissing(obligationRes.error, /store_sale_fee_obligations|schema cache|does not exist/i)
  ) {
    sectionErrors.push(`obligation:${obligationRes.error.message}`);
  }
  if (
    coinLedgerRes.error &&
    !isMissing(coinLedgerRes.error, /store_economic_point_ledger|schema cache|does not exist/i)
  ) {
    sectionErrors.push(`coin_ledger:${coinLedgerRes.error.message}`);
  }
  if (
    cashLedgerRes.error &&
    !isMissing(cashLedgerRes.error, /business_cash_ledger|schema cache|does not exist/i)
  ) {
    sectionErrors.push(`cash_ledger:${cashLedgerRes.error.message}`);
  }

  const pointUnavailable = !!pointRes.error && !isMissing(pointRes.error, /point_charge_requests|schema cache|does not exist/i);
  const cashUnavailable =
    !!cashPendingRes.error &&
    !isMissing(cashPendingRes.error, /business_cash_charge_requests|schema cache|does not exist/i);
  const coinWdUnavailable =
    !!coinWithdrawRes.error &&
    !isMissing(coinWithdrawRes.error, /coin_withdrawal_requests|schema cache|does not exist/i);
  const stlUnavailable =
    !!settlementRes.error && !isMissing(settlementRes.error, /store_settlements|schema cache|does not exist/i);
  const oblUnavailable =
    !!obligationRes.error &&
    !isMissing(obligationRes.error, /store_sale_fee_obligations|schema cache|does not exist/i);

  const pointRows = pointUnavailable ? [] : ((pointRes.data ?? []) as Record<string, unknown>[]);
  const pointPending = pointRows.filter((r) => isPointActionable(String(r.request_status ?? "")));

  const memberIds = [
    ...new Set(
      pointPending
        .map((r) => String(r.user_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const storeIds = [
    ...new Set(
      [
        ...((cashPendingRes.data ?? []) as Record<string, unknown>[]).map((r) => String(r.store_id ?? "")),
        ...((coinWithdrawRes.data ?? []) as Record<string, unknown>[]).map((r) => String(r.store_id ?? "")),
        ...((settlementRes.data ?? []) as Record<string, unknown>[]).map((r) => String(r.store_id ?? "")),
        ...((obligationRes.data ?? []) as Record<string, unknown>[]).map((r) => String(r.store_id ?? "")),
        ...((coinLedgerRes.data ?? []) as Record<string, unknown>[]).map((r) => String(r.store_id ?? "")),
        ...((cashLedgerRes.data ?? []) as Record<string, unknown>[]).map((r) => String(r.store_id ?? "")),
      ]
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ].slice(0, 120);

  const nickById: Record<string, string> = {};
  const storeNameById: Record<string, string> = {};
  if (memberIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname, username").in("id", memberIds);
    for (const p of profiles ?? []) {
      const id = String((p as { id?: string }).id ?? "");
      nickById[id] =
        String((p as { nickname?: string }).nickname ?? "").trim() ||
        String((p as { username?: string }).username ?? "").trim() ||
        id.slice(0, 8);
    }
  }
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of stores ?? []) {
      storeNameById[String((s as { id?: string }).id ?? "")] =
        String((s as { store_name?: string }).store_name ?? "").trim() || "Store";
    }
  }

  const actionRequired: FinanceActionItem[] = [];

  for (const r of pointPending.slice(0, 12)) {
    const id = String(r.id ?? "");
    const userId = String(r.user_id ?? "");
    const at = String(r.requested_at ?? "");
    const pts = Math.trunc(Number(r.point_amount) || 0);
    actionRequired.push({
      id: `point:${id}`,
      type: "point_charge",
      currency: "POINT",
      actorKind: "member",
      actorId: userId,
      actorLabel: nickById[userId] || userId.slice(0, 8),
      amount: pts,
      amountMinor: null,
      amountLabel: `${pts.toLocaleString()} Point`,
      status: String(r.request_status ?? ""),
      at,
      ageHours: ageHours(at),
      source: "point_charge_requests",
      href: pointChargeHref(id),
      statementHref: null,
      memberHref: userId ? memberHref(userId) : null,
      referenceType: "point_charge_request",
      referenceId: id,
      referenceHref: pointChargeHref(id),
    });
  }

  for (const r of cashUnavailable ? [] : ((cashPendingRes.data ?? []) as Record<string, unknown>[]).slice(0, 12)) {
    const id = String(r.id ?? "");
    const storeId = String(r.store_id ?? "");
    const at = String(r.created_at ?? "");
    const minor = Math.trunc(Number(r.amount_minor) || 0);
    actionRequired.push({
      id: `cash:${id}`,
      type: "cash_topup",
      currency: "CASH",
      actorKind: "store",
      actorId: storeId,
      actorLabel: storeNameById[storeId] || storeId.slice(0, 8),
      amount: null,
      amountMinor: minor,
      amountLabel: cashMinorLabel(minor),
      status: String(r.status ?? ""),
      at,
      ageHours: ageHours(at),
      source: "business_cash_charge_requests",
      href: "/admin/delivery-ads/cash-charges",
      statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
      memberHref: r.owner_user_id ? memberHref(String(r.owner_user_id)) : null,
      referenceType: "business_cash_charge_request",
      referenceId: id,
      referenceHref: "/admin/delivery-ads/cash-charges",
    });
  }

  for (const r of coinWdUnavailable
    ? []
    : ((coinWithdrawRes.data ?? []) as Record<string, unknown>[]).slice(0, 12)) {
    const id = String(r.id ?? "");
    const storeId = String(r.store_id ?? "");
    const at = String(r.created_at ?? "");
    const amt = Math.trunc(Number(r.amount) || 0);
    actionRequired.push({
      id: `coinwd:${id}`,
      type: "coin_withdrawal",
      currency: "COIN",
      actorKind: "store",
      actorId: storeId,
      actorLabel: storeNameById[storeId] || storeId.slice(0, 8),
      amount: amt,
      amountMinor: null,
      amountLabel: `${amt.toLocaleString()} Coin`,
      status: String(r.status ?? ""),
      at,
      ageHours: ageHours(at),
      source: "coin_withdrawal_requests",
      href: "/admin/finance#coin-withdrawals",
      statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
      memberHref: r.owner_user_id ? memberHref(String(r.owner_user_id)) : null,
      referenceType: "coin_withdrawal_request",
      referenceId: id,
      referenceHref: "/admin/finance#coin-withdrawals",
    });
  }

  for (const r of stlUnavailable ? [] : ((settlementRes.data ?? []) as Record<string, unknown>[]).slice(0, 12)) {
    const id = String(r.id ?? "");
    const storeId = String(r.store_id ?? "");
    const at = String(r.created_at ?? "");
    const net = Number(r.net_settlement_amount ?? r.settlement_amount) || 0;
    actionRequired.push({
      id: `stl:${id}`,
      type: "settlement",
      currency: "PHP_SETTLEMENT",
      actorKind: "store",
      actorId: storeId,
      actorLabel: storeNameById[storeId] || storeId.slice(0, 8),
      amount: net,
      amountMinor: null,
      amountLabel: phpMajor(net),
      status: String(r.settlement_status ?? ""),
      at,
      ageHours: ageHours(at),
      source: "store_settlements",
      href: `/admin/store-settlements?store_id=${encodeURIComponent(storeId)}&settlement_status=${encodeURIComponent(String(r.settlement_status ?? "scheduled"))}`,
      statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
      memberHref: null,
      referenceType: "store_settlement",
      referenceId: id,
      referenceHref: `/admin/store-settlements?store_id=${encodeURIComponent(storeId)}`,
    });
  }

  const oblRows = oblUnavailable ? [] : ((obligationRes.data ?? []) as Record<string, unknown>[]);
  const oblByStore = new Map<string, { outstanding: number; oldest: string; sampleOrder: string }>();
  for (const r of oblRows) {
    const storeId = String(r.store_id ?? "").trim();
    if (!storeId) continue;
    const open = Math.trunc(Number(r.fee_outstanding_minor) || 0);
    const created = String(r.created_at ?? "");
    const prev = oblByStore.get(storeId);
    if (!prev) {
      oblByStore.set(storeId, {
        outstanding: open,
        oldest: created,
        sampleOrder: String(r.order_id ?? ""),
      });
    } else {
      prev.outstanding += open;
      if (created && (!prev.oldest || created < prev.oldest)) {
        prev.oldest = created;
        prev.sampleOrder = String(r.order_id ?? "");
      }
    }
  }

  for (const [storeId, agg] of [...oblByStore.entries()].slice(0, 12)) {
    actionRequired.push({
      id: `obl:${storeId}`,
      type: "fee_obligation",
      currency: "CASH",
      actorKind: "store",
      actorId: storeId,
      actorLabel: storeNameById[storeId] || storeId.slice(0, 8),
      amount: null,
      amountMinor: agg.outstanding,
      amountLabel: cashMinorLabel(agg.outstanding),
      status: "미납",
      at: agg.oldest,
      ageHours: ageHours(agg.oldest),
      source: "store_sale_fee_obligations",
      href: businessCcFinancialStatementHref(storeId),
      statementHref: businessCcFinancialStatementHref(storeId),
      memberHref: null,
      referenceType: "store_order",
      referenceId: agg.sampleOrder || null,
      referenceHref: agg.sampleOrder
        ? `/admin/store-orders?store_id=${encodeURIComponent(storeId)}&q=${encodeURIComponent(agg.sampleOrder)}`
        : null,
    });
  }

  actionRequired.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const pointPendingRows: FinanceSectionRow[] = pointPending.slice(0, 20).map((r) => {
    const id = String(r.id ?? "");
    const userId = String(r.user_id ?? "");
    const pts = Math.trunc(Number(r.point_amount) || 0);
    const rate = Number(r.applied_rate);
    return {
      id,
      storeId: null,
      memberId: userId,
      label: nickById[userId] || userId.slice(0, 8),
      type: "POINT_CHARGE",
      amountLabel: `${pts.toLocaleString()} Point`,
      status: String(r.request_status ?? ""),
      at: String(r.requested_at ?? ""),
      href: pointChargeHref(id),
      statementHref: null,
      memberHref: userId ? memberHref(userId) : null,
      meta: Number.isFinite(rate) && rate > 0 ? `applied_rate=${rate}` : null,
    };
  });

  const cashPendingRows: FinanceSectionRow[] = (
    cashUnavailable ? [] : ((cashPendingRes.data ?? []) as Record<string, unknown>[])
  ).map((r) => {
    const storeId = String(r.store_id ?? "");
    return {
      id: String(r.id ?? ""),
      storeId,
      memberId: r.owner_user_id ? String(r.owner_user_id) : null,
      label: storeNameById[storeId] || storeId.slice(0, 8),
      type: "CASH_TOP_UP",
      amountLabel: cashMinorLabel(Math.trunc(Number(r.amount_minor) || 0)),
      status: String(r.status ?? ""),
      at: String(r.created_at ?? ""),
      href: "/admin/delivery-ads/cash-charges",
      statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
      memberHref: r.owner_user_id ? memberHref(String(r.owner_user_id)) : null,
      meta: null,
    };
  });

  const coinWdRows: FinanceSectionRow[] = (
    coinWdUnavailable ? [] : ((coinWithdrawRes.data ?? []) as Record<string, unknown>[])
  ).map((r) => {
    const storeId = String(r.store_id ?? "");
    return {
      id: String(r.id ?? ""),
      storeId,
      memberId: r.owner_user_id ? String(r.owner_user_id) : null,
      label: storeNameById[storeId] || storeId.slice(0, 8),
      type: "COIN_WITHDRAWAL",
      amountLabel: `${Math.trunc(Number(r.amount) || 0).toLocaleString()} Coin`,
      status: String(r.status ?? ""),
      at: String(r.created_at ?? ""),
      href: "/admin/finance#coin-withdrawals",
      statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
      memberHref: r.owner_user_id ? memberHref(String(r.owner_user_id)) : null,
      meta: r.source_kind ? String(r.source_kind) : null,
    };
  });

  const settlementRows: FinanceSectionRow[] = (
    stlUnavailable ? [] : ((settlementRes.data ?? []) as Record<string, unknown>[])
  ).map((r) => {
    const storeId = String(r.store_id ?? "");
    const gross = Number(r.gross_amount) || 0;
    const fee =
      (Number(r.platform_fee_amount) || 0) + (Number(r.fixed_fee_amount) || 0);
    const net = Number(r.net_settlement_amount ?? r.settlement_amount) || 0;
    return {
      id: String(r.id ?? ""),
      storeId,
      memberId: null,
      label: storeNameById[storeId] || storeId.slice(0, 8),
      type: `SETTLEMENT_${String(r.settlement_status ?? "").toUpperCase()}`,
      amountLabel: `gross ${phpMajor(gross)} · fee ${phpMajor(fee)} · net ${phpMajor(net)}`,
      status: String(r.settlement_status ?? ""),
      at: String(r.created_at ?? ""),
      href: `/admin/store-settlements?store_id=${encodeURIComponent(storeId)}`,
      statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
      memberHref: null,
      meta: r.order_id ? `order=${String(r.order_id).slice(0, 8)}` : null,
    };
  });

  const obligationSectionRows: FinanceSectionRow[] = [...oblByStore.entries()].slice(0, 20).map(
    ([storeId, agg]) => ({
      id: storeId,
      storeId,
      memberId: null,
      label: storeNameById[storeId] || storeId.slice(0, 8),
      type: "UNPAID_SALE_FEE",
      amountLabel: cashMinorLabel(agg.outstanding),
      status: "미납",
      at: agg.oldest,
      href: businessCcFinancialStatementHref(storeId),
      statementHref: businessCcFinancialStatementHref(storeId),
      memberHref: null,
      meta: agg.sampleOrder ? `order=${agg.sampleOrder.slice(0, 8)}` : null,
    })
  );

  const coinCredits: FinanceSectionRow[] = [];
  const coinConversions: FinanceSectionRow[] = [];
  for (const row of coinLedgerRes.error
    ? []
    : ((coinLedgerRes.data ?? []) as Record<string, unknown>[])) {
    const kind = String(row.entry_kind ?? "");
    const storeId = String(row.store_id ?? "");
    const relatedType = String(row.related_type ?? "");
    const relatedId = String(row.related_id ?? "");
    const amount = Math.trunc(Number(row.amount) || 0);
    const base: FinanceSectionRow = {
      id: String(row.id ?? ""),
      storeId,
      memberId: null,
      label: storeNameById[storeId] || storeId.slice(0, 8),
      type: kind,
      amountLabel: `${Math.abs(amount).toLocaleString()} Coin`,
      status: "ledger",
      at: String(row.created_at ?? ""),
      href: storeId ? businessCcFinancialStatementHref(storeId) : "/admin/finance",
      statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
      memberHref: null,
      meta:
        relatedId && (kind === "SALE_EARN" || kind === "ECONOMIC_INFLOW")
          ? `${relatedType || "ref"}:${relatedId.slice(0, 8)}`
          : relatedId
            ? `${relatedType || "ref"}:${relatedId.slice(0, 8)}`
            : null,
    };
    if (kind === "SALE_EARN" || kind === "ECONOMIC_INFLOW") coinCredits.push(base);
    if (kind === "CONVERT_TO_BUSINESS_CASH") {
      const meta = row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null;
      const rateRaw = meta?.applied_rate ?? meta?.rate ?? meta?.conversion_rate;
      const rate =
        rateRaw != null && Number.isFinite(Number(rateRaw)) ? Number(rateRaw) : null;
      coinConversions.push({
        ...base,
        meta: rate != null ? `applied_rate=${rate}` : "applied_rate=NOT_AVAILABLE",
      });
    }
  }

  const cashRecent: FinanceSectionRow[] = [];
  const refundRows: FinanceSectionRow[] = [];
  for (const row of cashLedgerRes.error
    ? []
    : ((cashLedgerRes.data ?? []) as Record<string, unknown>[])) {
    const kind = String(row.entry_kind ?? "");
    const storeId = String(row.store_id ?? "");
    const relatedType = String(row.related_type ?? "");
    const relatedId = String(row.related_id ?? "");
    const minor = Math.trunc(Number(row.amount_minor) || 0);
    const direction = String(row.direction ?? "");
    const item: FinanceSectionRow = {
      id: String(row.id ?? ""),
      storeId,
      memberId: null,
      label: storeNameById[storeId] || storeId.slice(0, 8),
      type: `${kind}/${direction || "n/a"}`,
      amountLabel: cashMinorLabel(minor),
      status: direction || "ledger",
      at: String(row.created_at ?? ""),
      href: storeId ? businessCcFinancialStatementHref(storeId) : "/admin/finance",
      statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
      memberHref: null,
      meta: relatedId
        ? `${relatedType || "ref"}:${relatedId.slice(0, 8)}`
        : null,
    };
    cashRecent.push(item);
    if (kind === "AD_REFUND" || kind === "PARTNER_REFUND") {
      refundRows.push({
        ...item,
        type: kind,
        meta: `Cash refund · ${item.meta ?? "no-ref"}`,
      });
    }
  }

  // Settlement refund amounts (distinct from Cash ad refund)
  const { data: refundSettlements } = await sb
    .from("store_settlements")
    .select("id, store_id, order_id, refund_amount, settlement_status, created_at")
    .gt("refund_amount", 0)
    .order("created_at", { ascending: false })
    .limit(15);
  for (const r of (refundSettlements ?? []) as Record<string, unknown>[]) {
    const storeId = String(r.store_id ?? "");
    refundRows.push({
      id: `stl-refund:${String(r.id ?? "")}`,
      storeId,
      memberId: null,
      label: storeNameById[storeId] || storeId.slice(0, 8) || "Store",
      type: "SETTLEMENT_REFUND",
      amountLabel: phpMajor(Number(r.refund_amount) || 0),
      status: String(r.settlement_status ?? ""),
      at: String(r.created_at ?? ""),
      href: `/admin/store-settlements?store_id=${encodeURIComponent(storeId)}`,
      statementHref: storeId ? businessCcFinancialStatementHref(storeId) : null,
      memberHref: null,
      meta: r.order_id ? `order=${String(r.order_id).slice(0, 8)}` : "settlement refund",
    });
  }

  const outstandingMinor = oblUnavailable
    ? null
    : [...oblByStore.values()].reduce((s, v) => s + v.outstanding, 0);

  const recent: FinanceSectionRow[] = [
    ...pointPendingRows.map((r) => ({ ...r, type: `POINT/${r.type}` })),
    ...cashPendingRows,
    ...coinWdRows,
    ...coinCredits.slice(0, 10),
    ...coinConversions.slice(0, 10),
    ...cashRecent.slice(0, 15),
    ...settlementRows.slice(0, 10),
    ...obligationSectionRows.slice(0, 8),
    ...refundRows.slice(0, 10),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 40);

  return {
    generatedAt: new Date().toISOString(),
    actionRequired: actionRequired.slice(0, 40),
    queues: {
      point: {
        count: pointUnavailable ? null : pointPending.length,
        unavailable: pointUnavailable,
        source: "point_charge_requests actionable",
        href: "/admin/point-charges",
      },
      cash: {
        count: cashUnavailable ? null : cashPendingRows.length,
        unavailable: cashUnavailable,
        source: "business_cash_charge_requests PENDING",
        href: "/admin/delivery-ads/cash-charges",
      },
      coinWithdraw: {
        count: coinWdUnavailable ? null : coinWdRows.length,
        unavailable: coinWdUnavailable,
        source: "coin_withdrawal_requests REQUESTED",
        href: "/admin/finance#coin-withdrawals",
      },
      settlement: {
        count: stlUnavailable ? null : settlementRows.length,
        unavailable: stlUnavailable,
        source: "store_settlements scheduled|held|processing",
        href: "/admin/store-settlements?settlement_status=scheduled",
      },
      obligationStores: {
        count: oblUnavailable ? null : oblByStore.size,
        unavailable: oblUnavailable,
        source: "store_sale_fee_obligations open (store count)",
        href: "/admin/finance#obligations",
      },
    },
    currentState: [
      {
        id: "point_pending",
        labelKo: "Point 충전 대기",
        labelEn: "Point charges pending",
        value: pointUnavailable ? null : pointPending.length,
        href: "/admin/point-charges",
        source: "point_charge_requests",
        currencyNote: "POINT",
      },
      {
        id: "cash_pending",
        labelKo: "Cash 충전 대기",
        labelEn: "Cash top-ups pending",
        value: cashUnavailable ? null : cashPendingRows.length,
        href: "/admin/delivery-ads/cash-charges",
        source: "business_cash_charge_requests",
        currencyNote: "CASH",
      },
      {
        id: "coin_withdraw",
        labelKo: "Coin 출금 대기",
        labelEn: "Coin withdrawals open",
        value: coinWdUnavailable ? null : coinWdRows.length,
        href: "/admin/finance#coin-withdrawals",
        source: "coin_withdrawal_requests",
        currencyNote: "COIN",
      },
      {
        id: "settlement_pending",
        labelKo: "정산 검토",
        labelEn: "Settlements to review",
        value: stlUnavailable ? null : settlementRows.length,
        href: "/admin/store-settlements?settlement_status=scheduled",
        source: "store_settlements",
        currencyNote: "SETTLEMENT",
      },
      {
        id: "obligation_stores",
        labelKo: "미납 수수료 매장",
        labelEn: "Stores with unpaid fee",
        value: oblUnavailable ? null : oblByStore.size,
        href: "/admin/finance#obligations",
        source: "store_sale_fee_obligations",
        currencyNote: "CASH obligation",
      },
    ],
    point: {
      pendingRows: pointPendingRows,
      unavailable: pointUnavailable,
      source: "point_charge_requests",
      queueHref: "/admin/point-charges",
    },
    coin: {
      withdrawRows: coinWdRows,
      recentCredits: coinCredits.slice(0, 15),
      recentConversions: coinConversions.slice(0, 15),
      unavailable: coinWdUnavailable && !!coinLedgerRes.error,
      source: "coin_withdrawal_requests + store_economic_point_ledger",
      queueHref: "/admin/finance#coin-withdrawals",
    },
    cash: {
      pendingTopUps: cashPendingRows,
      recentLedger: cashRecent.slice(0, 20),
      unavailable: cashUnavailable && !!cashLedgerRes.error,
      source: "business_cash_charge_requests + business_cash_ledger",
      queueHref: "/admin/delivery-ads/cash-charges",
    },
    obligations: {
      rows: obligationSectionRows,
      storeCount: oblUnavailable ? null : oblByStore.size,
      outstandingMinor,
      unavailable: oblUnavailable,
      source: "store_sale_fee_obligations",
    },
    settlements: {
      rows: settlementRows,
      pendingCount: stlUnavailable ? null : settlementRows.length,
      unavailable: stlUnavailable,
      source: "store_settlements",
      queueHref: "/admin/store-settlements?settlement_status=scheduled",
    },
    refunds: {
      rows: refundRows.slice(0, 20),
      unavailable: false,
      source: "business_cash_ledger refunds + store_settlements.refund_amount",
    },
    recent,
    primaryEntries: [
      {
        id: "point_queue",
        labelKo: "Point 충전 큐",
        labelEn: "Point charge queue",
        href: "/admin/point-charges",
        frequency: "REALTIME_CRITICAL",
      },
      {
        id: "cash_queue",
        labelKo: "Cash 충전 큐",
        labelEn: "Cash top-up queue",
        href: "/admin/delivery-ads/cash-charges",
        frequency: "REALTIME_CRITICAL",
      },
      {
        id: "settlements",
        labelKo: "정산 큐",
        labelEn: "Settlement queue",
        href: "/admin/store-settlements?settlement_status=scheduled",
        frequency: "DAILY",
      },
      {
        id: "coin_withdraw",
        labelKo: "Coin 출금",
        labelEn: "Coin withdrawals",
        href: "/admin/finance#coin-withdrawals",
        frequency: "DAILY",
      },
      {
        id: "statement",
        labelKo: "매장 재무 명세서 (B3)",
        labelEn: "Store financial statement (B3)",
        href: "/admin/business",
        frequency: "FREQUENT",
      },
      {
        id: "ads_control_plane",
        labelKo: "광고 / 노출 관제 (B5)",
        labelEn: "Ads / Exposure control plane (B5)",
        href: "/admin/delivery-ads#action-required",
        frequency: "FREQUENT",
      },
      {
        id: "point_ledger",
        labelKo: "Point 원장",
        labelEn: "Point ledger",
        href: "/admin/points/ledger",
        frequency: "OCCASIONAL",
      },
      {
        id: "archive",
        labelKo: "보관 원장",
        labelEn: "Archive ledger",
        href: "/admin/store-point-ledger",
        frequency: "ARCHIVE",
      },
    ],
    sectionErrors,
  };
}
