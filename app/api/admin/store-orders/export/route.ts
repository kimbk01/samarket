/**
 * GET /api/admin/store-orders/export — CSV (UTF-8 BOM)
 * `view=ops&screen=…`: the order-ops screen filters (`admin_store_order_ops_page`, every page at one `as_of`).
 * `view=list`: the 1단계 list filters (same RPC, every page at one `as_of`).
 * Otherwise: legacy limit-based export.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  ADMIN_STORE_ORDERS_MAX_PAGE_SIZE,
  parseAdminStoreOrdersQuery,
} from "@/lib/admin/store-orders/admin-store-orders-contract";
import { loadAdminStoreOrdersPage } from "@/lib/admin/store-orders/load-admin-store-orders-page";
import {
  ADMIN_ORDER_OPS_MAX_PAGE_SIZE,
  ADMIN_ORDER_OPS_SCREENS,
  parseAdminOrderOpsQuery,
  type AdminOrderOpsScreen,
} from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import { loadAdminOrderOpsPage } from "@/lib/admin/store-orders/load-admin-store-order-ops";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(s: string) {
  const t = String(s ?? "");
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** Hard cap for one CSV download (rows). */
const LIST_EXPORT_MAX_ROWS = 20_000;

function csvResponse(lines: string[]) {
  return new NextResponse("\uFEFF" + lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="store-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

async function exportListView(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  sp: URLSearchParams
) {
  const base = parseAdminStoreOrdersQuery(sp);
  const header = [
    "order_no",
    "store_name",
    "buyer",
    "items",
    "total_amount",
    "payment_amount",
    "fulfillment_type",
    "order_status",
    "payment_status",
    "commission_state",
    "integrity_flags",
    "created_at",
    "completed_at",
  ];
  const lines = [header.join(",")];
  let asOf: string | null = base.asOf;
  for (let page = 1; (page - 1) * ADMIN_STORE_ORDERS_MAX_PAGE_SIZE < LIST_EXPORT_MAX_ROWS; page += 1) {
    const out = await loadAdminStoreOrdersPage(sb, {
      ...base,
      page,
      pageSize: ADMIN_STORE_ORDERS_MAX_PAGE_SIZE,
      asOf,
    });
    if (!out.ok) {
      return NextResponse.json(
        { ok: false, error: out.error },
        { status: out.error === "rpc_missing" ? 503 : 500 }
      );
    }
    asOf = out.result.asOf;
    for (const r of out.result.rows) {
      lines.push(
        [
          r.order_no,
          r.store_name,
          r.buyer_label,
          r.first_title ? `${r.first_title}${r.line_count > 1 ? ` +${r.line_count - 1}` : ""}` : "",
          String(r.total_amount),
          String(r.payment_amount),
          r.fulfillment_type,
          r.order_status,
          r.payment_status,
          r.commission_state ?? "",
          r.integrity_flags.join("|"),
          r.created_at,
          r.completed_at ?? "",
        ]
          .map(csvEscape)
          .join(",")
      );
    }
    if (out.result.rows.length < ADMIN_STORE_ORDERS_MAX_PAGE_SIZE) break;
  }
  return csvResponse(lines);
}

async function exportOpsView(sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>, sp: URLSearchParams) {
  const screen = sp.get("screen") as AdminOrderOpsScreen;
  if (!(ADMIN_ORDER_OPS_SCREENS as readonly string[]).includes(screen)) {
    return NextResponse.json({ ok: false, error: "invalid_screen" }, { status: 400 });
  }
  const base = parseAdminOrderOpsQuery(screen, sp);
  const header = [
    "order_no",
    "store_name",
    "buyer",
    "items",
    "order_amount",
    "coupon_discount",
    "gift_amount",
    "customer_paid",
    "payment_method",
    "payment_status",
    "fulfillment_type",
    "order_status",
    "commission_state",
    "money_mismatch",
    "created_at",
    "basis_at",
    "completed_at",
  ];
  const lines = [header.join(",")];
  let asOf: string | null = base.asOf;
  for (let page = 1; (page - 1) * ADMIN_ORDER_OPS_MAX_PAGE_SIZE < LIST_EXPORT_MAX_ROWS; page += 1) {
    const out = await loadAdminOrderOpsPage(sb, { ...base, page, pageSize: ADMIN_ORDER_OPS_MAX_PAGE_SIZE, asOf });
    if (!out.ok) {
      return NextResponse.json({ ok: false, error: out.error }, { status: out.error === "rpc_missing" ? 503 : 500 });
    }
    asOf = out.result.asOf;
    for (const r of out.result.rows) {
      lines.push(
        [
          r.order_no,
          r.store_name,
          r.buyer_label,
          r.first_title ? `${r.first_title}${r.line_count > 1 ? ` +${r.line_count - 1}` : ""}` : "",
          String(r.total_amount),
          String(r.discount_amount),
          String(r.gift_amount),
          String(r.payment_amount),
          r.buyer_payment_method ?? "",
          r.payment_status,
          r.fulfillment_type,
          r.order_status,
          r.commission_state ?? "",
          r.money_mismatch ? "1" : "",
          r.created_at,
          r.basis_at,
          r.completed_at ?? "",
        ]
          .map(csvEscape)
          .join(",")
      );
    }
    if (out.result.rows.length < ADMIN_ORDER_OPS_MAX_PAGE_SIZE) break;
  }
  return csvResponse(lines);
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  if (sp.get("view") === "list") return exportListView(sb, sp);
  if (sp.get("view") === "ops") return exportOpsView(sb, sp);

  const orderId = sp.get("order_id")?.trim();
  const orderNo = sp.get("order_no")?.trim();
  const storeIdFilter = sp.get("store_id")?.trim();
  const buyerUserIdFilter = sp.get("buyer_user_id")?.trim();
  const paymentStatus = sp.get("payment_status")?.trim();
  const orderStatus = sp.get("order_status")?.trim();
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 500, 1), 2000);

  let q = sb
    .from("store_orders")
    .select(
      "id, order_no, buyer_user_id, store_id, total_amount, discount_amount, amount_before_gift, gift_redemption_amount, platform_funded_amount, payment_amount, payment_status, order_status, fulfillment_type, community_messenger_room_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (orderId) q = q.eq("id", orderId);
  if (orderNo) q = q.ilike("order_no", `%${orderNo}%`);
  if (storeIdFilter) q = q.eq("store_id", storeIdFilter);
  if (buyerUserIdFilter) q = q.eq("buyer_user_id", buyerUserIdFilter);
  if (paymentStatus) q = q.eq("payment_status", paymentStatus);
  if (orderStatus) q = q.eq("order_status", orderStatus);

  const { data: list, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = list ?? [];
  const storeIds = [...new Set(rows.map((r) => r.store_id as string))];
  const names: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    for (const s of stores ?? []) names[s.id as string] = (s.store_name as string) ?? "";
  }

  const header = [
    "id",
    "order_no",
    "store_id",
    "store_name",
    "buyer_user_id",
    "total_amount",
    "discount_amount",
    "amount_before_gift",
    "gift_redemption_amount",
    "customer_remaining_payment",
    "merchant_revenue_amount",
    "payment_status",
    "order_status",
    "fulfillment_type",
    "community_messenger_room_id",
    "created_at",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        csvEscape(r.id as string),
        csvEscape(r.order_no as string),
        csvEscape(r.store_id as string),
        csvEscape(names[r.store_id as string] ?? ""),
        csvEscape(r.buyer_user_id as string),
        csvEscape(String(r.total_amount ?? "")),
        csvEscape(String(r.discount_amount ?? "")),
        csvEscape(String(r.amount_before_gift ?? "")),
        csvEscape(String(r.gift_redemption_amount ?? "")),
        csvEscape(String(r.payment_amount ?? "")),
        csvEscape(
          String(
            Math.max(
              0,
              Math.round(Number(r.payment_amount) || 0) +
                Math.round(Number(r.gift_redemption_amount) || 0) +
                Math.round(Number(r.platform_funded_amount) || 0)
            )
          )
        ),
        csvEscape(r.payment_status as string),
        csvEscape(r.order_status as string),
        csvEscape(r.fulfillment_type as string),
        csvEscape(String(r.community_messenger_room_id ?? "")),
        csvEscape(r.created_at as string),
      ].join(",")
    ),
  ];
  return csvResponse(lines);
}
