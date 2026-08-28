import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminGiftProfileLabel,
  loadAdminGiftProfileMap,
} from "@/lib/gift-certificate/admin-gift-ops-profile";
import {
  isRedemptionRecognizedFromLedger,
  resolveGiftRedemptionRecognitionState,
} from "@/lib/gift-certificate/gift-revenue-recognition";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function n(v: unknown): number {
  return Math.trunc(Number(v) || 0);
}

export type AdminGiftLedgerRedemptionRow = {
  id: string;
  usedAt: string;
  customerLabel: string;
  customerUserId: string | null;
  storeId: string;
  storeName: string;
  publicGiftNumber: string;
  giftScope: "PLATFORM" | "STORE";
  instanceId: string;
  productId: string;
  productTitle: string;
  orderId: string;
  orderNo: string | null;
  orderStatus: string | null;
  gross: number;
  feeRate: number;
  platformFee: number;
  merchantNet: number;
  reversed: boolean;
  recognitionState: string;
  recognizedAt: string | null;
};

export type AdminGiftLedgerLoadFilters = {
  productId?: string | null;
  instanceId?: string | null;
  filter?: "all" | "pending" | "recognized" | "reversed" | string;
  q?: string | null;
  limit?: number;
};

/**
 * Shared redemption/usage ledger loader for Global Usage, Product activity, and Instance finance.
 * One authority + optional productId / instanceId filters — no parallel aggregators.
 */
export async function loadAdminGiftLedgerRedemptions(
  sb: SupabaseClient,
  filters: AdminGiftLedgerLoadFilters = {}
): Promise<{ ok: true; redemptions: AdminGiftLedgerRedemptionRow[] } | { ok: false; error: string }> {
  const productId = s(filters.productId);
  const instanceId = s(filters.instanceId);
  const filter = s(filters.filter).toLowerCase() || "all";
  const q = s(filters.q).toUpperCase();
  const limit = Math.min(Math.max(filters.limit ?? 300, 1), 5000);

  let instanceIdsFilter: string[] | null = null;
  if (instanceId) {
    instanceIdsFilter = [instanceId];
  } else if (productId) {
    const { data: instRows, error: instErr } = await sb
      .from(GIFT_TABLES.instances)
      .select("id")
      .eq("product_id", productId)
      .limit(500);
    if (instErr) return { ok: false, error: instErr.message };
    instanceIdsFilter = ((instRows ?? []) as Record<string, unknown>[])
      .map((r) => s(r.id))
      .filter(Boolean);
    if (!instanceIdsFilter.length) {
      return { ok: true, redemptions: [] };
    }
  }

  let query = sb
    .from(GIFT_TABLES.redemptions)
    .select(
      "id, order_id, instance_id, store_id, redeemed_amount, platform_fee_amount, merchant_net_amount, platform_fee_rate_snapshot, reversed, created_at, reversed_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (instanceIdsFilter) {
    query = query.in("instance_id", instanceIdsFilter);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as Record<string, unknown>[];
  const instanceIds = [...new Set(rows.map((r) => s(r.instance_id)).filter(Boolean))];
  const orderIds = [...new Set(rows.map((r) => s(r.order_id)).filter(Boolean))];
  const storeIds = [...new Set(rows.map((r) => s(r.store_id)).filter(Boolean))];
  const redemptionIds = rows.map((r) => s(r.id)).filter(Boolean);

  const [{ data: instances }, { data: orders }, { data: stores }, { data: ledgerRows }] =
    await Promise.all([
      instanceIds.length
        ? sb
            .from(GIFT_TABLES.instances)
            .select("id, public_gift_number, product_id, current_owner_user_id, gift_scope")
            .in("id", instanceIds)
        : Promise.resolve({ data: [] }),
      orderIds.length
        ? sb.from("store_orders").select("id, order_no, order_status, user_id").in("id", orderIds)
        : Promise.resolve({ data: [] }),
      storeIds.length
        ? sb.from("stores").select("id, store_name").in("id", storeIds)
        : Promise.resolve({ data: [] }),
      redemptionIds.length
        ? sb
            .from(GIFT_TABLES.revenueLedger)
            .select("redemption_id, entry_type, amount, created_at")
            .in("redemption_id", redemptionIds)
            .limit(20000)
        : Promise.resolve({ data: [] }),
    ]);

  const ledgerMap = new Map<
    string,
    Array<{ entry_type: string; amount: number; created_at: string }>
  >();
  for (const row of (ledgerRows ?? []) as Record<string, unknown>[]) {
    const rid = s(row.redemption_id);
    if (!rid) continue;
    const list = ledgerMap.get(rid) ?? [];
    list.push({
      entry_type: s(row.entry_type),
      amount: n(row.amount),
      created_at: s(row.created_at),
    });
    ledgerMap.set(rid, list);
  }

  const instById = new Map(
    ((instances ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), r])
  );
  const productIds = [
    ...new Set(
      ((instances ?? []) as Record<string, unknown>[])
        .map((r) => s(r.product_id))
        .filter(Boolean)
    ),
  ];
  const { data: products } = productIds.length
    ? await sb.from(GIFT_TABLES.products).select("id, title").in("id", productIds)
    : { data: [] };
  const titleByProduct = new Map(
    ((products ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), s(r.title)])
  );
  const storeNameById = new Map(
    ((stores ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), s(r.store_name)])
  );
  const orderById = new Map(
    ((orders ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), r])
  );

  const buyerIds = [
    ...new Set(
      ((orders ?? []) as Record<string, unknown>[])
        .map((r) => s(r.user_id))
        .filter(Boolean)
    ),
  ];
  const profileMap = await loadAdminGiftProfileMap(sb, buyerIds);

  let list: AdminGiftLedgerRedemptionRow[] = rows.map((row) => {
    const id = s(row.id);
    const iid = s(row.instance_id);
    const orderId = s(row.order_id);
    const storeId = s(row.store_id);
    const inst = instById.get(iid);
    const order = orderById.get(orderId);
    const ledger = ledgerMap.get(id) ?? [];
    const recognized = isRedemptionRecognizedFromLedger(ledger);
    const reversed = row.reversed === true;
    const recognitionState = resolveGiftRedemptionRecognitionState({ reversed, recognized });
    const recognizedAt =
      recognitionState === "recognized"
        ? ledger.find((e) => e.entry_type === "REVENUE_AVAILABLE")?.created_at ?? null
        : null;
    const buyerId = s(order?.user_id);
    const pid = s(inst?.product_id);
    return {
      id,
      usedAt: s(row.created_at),
      customerLabel: adminGiftProfileLabel(profileMap.get(buyerId)),
      customerUserId: buyerId || null,
      storeId,
      storeName: storeNameById.get(storeId) ?? "",
      publicGiftNumber: s(inst?.public_gift_number),
      giftScope: s(inst?.gift_scope) === "PLATFORM" ? "PLATFORM" : "STORE",
      instanceId: iid,
      productId: pid,
      productTitle: titleByProduct.get(pid) ?? "",
      orderId,
      orderNo: s(order?.order_no) || null,
      orderStatus: s(order?.order_status) || null,
      gross: n(row.redeemed_amount),
      feeRate: n(row.platform_fee_rate_snapshot),
      platformFee: n(row.platform_fee_amount),
      merchantNet: n(row.merchant_net_amount),
      reversed,
      recognitionState,
      recognizedAt,
    };
  });

  if (q) {
    list = list.filter((row) => {
      const hay = [
        row.publicGiftNumber,
        row.storeName,
        row.customerLabel,
        row.orderNo ?? "",
        row.orderId,
        row.productTitle,
      ]
        .join(" ")
        .toUpperCase();
      return hay.includes(q);
    });
  }

  if (filter === "pending") {
    list = list.filter((r) => r.recognitionState === "pending");
  } else if (filter === "recognized") {
    list = list.filter((r) => r.recognitionState === "recognized");
  } else if (filter === "reversed") {
    list = list.filter((r) => r.recognitionState === "reversed");
  }

  return { ok: true, redemptions: list };
}
