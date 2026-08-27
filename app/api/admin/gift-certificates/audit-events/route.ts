import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adminGiftProfileLabel,
  loadAdminGiftProfileMap,
} from "@/lib/gift-certificate/admin-gift-ops-profile";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function n(v: unknown): number {
  return Math.trunc(Number(v) || 0);
}

type AuditEvent = {
  id: string;
  eventType: string;
  at: string;
  storeId: string | null;
  storeName: string | null;
  publicGiftNumber: string | null;
  instanceId: string | null;
  orderId: string | null;
  userId: string | null;
  userLabel: string | null;
  amount: number | null;
  summary: string;
};

/** GET /api/admin/gift-certificates/audit-events — chronological gift ops stream (read-only). */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;
  const url = new URL(req.url);
  const q = s(url.searchParams.get("q")).toUpperCase();
  const eventFilter = s(url.searchParams.get("event")).toUpperCase();
  const storeFilter = s(url.searchParams.get("storeId"));

  const [
    { data: products },
    { data: ownership },
    { data: transfers },
    { data: redemptions },
    { data: ledger },
    { data: cashOuts },
    { data: conversions },
    { data: recovery },
  ] = await Promise.all([
    sb
      .from(GIFT_TABLES.products)
      .select("id, store_id, title, active, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from(GIFT_TABLES.ownershipEvents)
      .select("id, instance_id, event_type, from_user_id, to_user_id, actor_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from(GIFT_TABLES.transfers)
      .select(
        "id, instance_id, sender_user_id, recipient_user_id, status, created_at, resolved_at"
      )
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from(GIFT_TABLES.redemptions)
      .select(
        "id, instance_id, store_id, order_id, redeemed_amount, reversed, created_at, reversed_at"
      )
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from(GIFT_TABLES.revenueLedger)
      .select("id, store_id, redemption_id, entry_type, amount, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from(GIFT_TABLES.cashOutRequests)
      .select("id, store_id, owner_user_id, amount, status, created_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from(GIFT_TABLES.conversionRequests)
      .select("id, store_id, owner_user_id, amount, status, created_at, approved_at")
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from(GIFT_TABLES.storeCashRecoveryObligations)
      .select("id, store_id, redemption_id, amount_original, amount_remaining, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const instanceIds = [
    ...new Set([
      ...((ownership ?? []) as Record<string, unknown>[]).map((r) => s(r.instance_id)),
      ...((transfers ?? []) as Record<string, unknown>[]).map((r) => s(r.instance_id)),
      ...((redemptions ?? []) as Record<string, unknown>[]).map((r) => s(r.instance_id)),
    ].filter(Boolean)),
  ];
  const { data: instances } = instanceIds.length
    ? await sb
        .from(GIFT_TABLES.instances)
        .select("id, public_gift_number, store_id")
        .in("id", instanceIds)
    : { data: [] };
  const instById = new Map(
    ((instances ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), r])
  );

  const storeIds = [
    ...new Set(
      [
        ...((products ?? []) as Record<string, unknown>[]).map((r) => s(r.store_id)),
        ...((redemptions ?? []) as Record<string, unknown>[]).map((r) => s(r.store_id)),
        ...((ledger ?? []) as Record<string, unknown>[]).map((r) => s(r.store_id)),
        ...((cashOuts ?? []) as Record<string, unknown>[]).map((r) => s(r.store_id)),
        ...((conversions ?? []) as Record<string, unknown>[]).map((r) => s(r.store_id)),
        ...((recovery ?? []) as Record<string, unknown>[]).map((r) => s(r.store_id)),
        ...((instances ?? []) as Record<string, unknown>[]).map((r) => s(r.store_id)),
      ].filter(Boolean)
    ),
  ];
  const { data: stores } = storeIds.length
    ? await sb.from("stores").select("id, store_name").in("id", storeIds)
    : { data: [] };
  const storeNameById = new Map(
    ((stores ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), s(r.store_name)])
  );

  const userIds = [
    ...new Set(
      [
        ...((ownership ?? []) as Record<string, unknown>[]).flatMap((r) => [
          s(r.from_user_id),
          s(r.to_user_id),
          s(r.actor_user_id),
        ]),
        ...((transfers ?? []) as Record<string, unknown>[]).flatMap((r) => [
          s(r.sender_user_id),
          s(r.recipient_user_id),
        ]),
        ...((cashOuts ?? []) as Record<string, unknown>[]).map((r) => s(r.owner_user_id)),
        ...((conversions ?? []) as Record<string, unknown>[]).map((r) => s(r.owner_user_id)),
      ].filter(Boolean)
    ),
  ];
  const profiles = await loadAdminGiftProfileMap(sb, userIds);

  const events: AuditEvent[] = [];

  for (const r of (products ?? []) as Record<string, unknown>[]) {
    const storeId = s(r.store_id);
    events.push({
      id: `product:${s(r.id)}`,
      eventType: r.active === true ? "PRODUCT_ACTIVATED" : "PRODUCT_APPROVED",
      at: s(r.created_at),
      storeId,
      storeName: storeNameById.get(storeId) ?? null,
      publicGiftNumber: null,
      instanceId: null,
      orderId: null,
      userId: null,
      userLabel: null,
      amount: null,
      summary: s(r.title),
    });
  }

  for (const r of (ownership ?? []) as Record<string, unknown>[]) {
    const instanceId = s(r.instance_id);
    const inst = instById.get(instanceId);
    const storeId = s(inst?.store_id);
    const et = s(r.event_type).toUpperCase();
    const mapped =
      et.includes("PURCHASE") || et === "ISSUED"
        ? "INSTANCE_PURCHASED"
        : et.includes("TRANSFER")
          ? "TRANSFER_ACCEPTED"
          : et || "OWNERSHIP_EVENT";
    const userId = s(r.to_user_id) || s(r.actor_user_id);
    events.push({
      id: `own:${s(r.id)}`,
      eventType: mapped,
      at: s(r.created_at),
      storeId: storeId || null,
      storeName: storeNameById.get(storeId) ?? null,
      publicGiftNumber: s(inst?.public_gift_number) || null,
      instanceId,
      orderId: null,
      userId: userId || null,
      userLabel: adminGiftProfileLabel(profiles.get(userId)),
      amount: null,
      summary: et,
    });
  }

  for (const r of (transfers ?? []) as Record<string, unknown>[]) {
    const instanceId = s(r.instance_id);
    const inst = instById.get(instanceId);
    const storeId = s(inst?.store_id);
    const st = s(r.status).toUpperCase();
    const eventType =
      st === "OFFERED" || st === "PENDING"
        ? "TRANSFER_OFFERED"
        : st === "ACCEPTED"
          ? "TRANSFER_ACCEPTED"
          : st === "REJECTED"
            ? "TRANSFER_REJECTED"
            : st === "CANCELLED"
              ? "TRANSFER_CANCELLED"
              : `TRANSFER_${st || "EVENT"}`;
    events.push({
      id: `xfer:${s(r.id)}:${st}`,
      eventType,
      at: s(r.resolved_at) || s(r.created_at),
      storeId: storeId || null,
      storeName: storeNameById.get(storeId) ?? null,
      publicGiftNumber: s(inst?.public_gift_number) || null,
      instanceId,
      orderId: null,
      userId: s(r.sender_user_id) || null,
      userLabel: adminGiftProfileLabel(profiles.get(s(r.sender_user_id))),
      amount: null,
      summary: `${adminGiftProfileLabel(profiles.get(s(r.sender_user_id)))} → ${adminGiftProfileLabel(profiles.get(s(r.recipient_user_id)))}`,
    });
  }

  for (const r of (redemptions ?? []) as Record<string, unknown>[]) {
    const instanceId = s(r.instance_id);
    const inst = instById.get(instanceId);
    const storeId = s(r.store_id) || s(inst?.store_id);
    events.push({
      id: `redeem:${s(r.id)}`,
      eventType: r.reversed === true ? "REFUND" : "REDEEMED",
      at: r.reversed === true ? s(r.reversed_at) || s(r.created_at) : s(r.created_at),
      storeId: storeId || null,
      storeName: storeNameById.get(storeId) ?? null,
      publicGiftNumber: s(inst?.public_gift_number) || null,
      instanceId,
      orderId: s(r.order_id) || null,
      userId: null,
      userLabel: null,
      amount: n(r.redeemed_amount),
      summary: r.reversed === true ? "REVERSAL" : "REDEEMED",
    });
  }

  for (const r of (ledger ?? []) as Record<string, unknown>[]) {
    const storeId = s(r.store_id);
    const et = s(r.entry_type).toUpperCase();
    const eventType =
      et === "REVENUE_AVAILABLE"
        ? "REVENUE_RECOGNIZED"
        : et === "REVERSED"
          ? "REVERSAL"
          : et || "LEDGER";
    events.push({
      id: `ledger:${s(r.id)}`,
      eventType,
      at: s(r.created_at),
      storeId: storeId || null,
      storeName: storeNameById.get(storeId) ?? null,
      publicGiftNumber: null,
      instanceId: null,
      orderId: null,
      userId: null,
      userLabel: null,
      amount: n(r.amount),
      summary: et,
    });
  }

  for (const r of (cashOuts ?? []) as Record<string, unknown>[]) {
    const storeId = s(r.store_id);
    const st = s(r.status).toUpperCase();
    events.push({
      id: `cashout:${s(r.id)}:${st}`,
      eventType: st === "PAID" ? "CASH_OUT_PAID" : "CASH_OUT_REQUESTED",
      at: st === "PAID" ? s(r.paid_at) || s(r.created_at) : s(r.created_at),
      storeId,
      storeName: storeNameById.get(storeId) ?? null,
      publicGiftNumber: null,
      instanceId: null,
      orderId: null,
      userId: s(r.owner_user_id) || null,
      userLabel: adminGiftProfileLabel(profiles.get(s(r.owner_user_id))),
      amount: n(r.amount),
      summary: st,
    });
  }

  for (const r of (conversions ?? []) as Record<string, unknown>[]) {
    const storeId = s(r.store_id);
    const st = s(r.status).toUpperCase();
    events.push({
      id: `conv:${s(r.id)}`,
      eventType: st === "APPROVED" || st === "COMPLETED" ? "STORE_CASH_CONVERTED" : "STORE_CASH_CONVERSION_REQUESTED",
      at: s(r.approved_at) || s(r.created_at),
      storeId,
      storeName: storeNameById.get(storeId) ?? null,
      publicGiftNumber: null,
      instanceId: null,
      orderId: null,
      userId: s(r.owner_user_id) || null,
      userLabel: adminGiftProfileLabel(profiles.get(s(r.owner_user_id))),
      amount: n(r.amount),
      summary: st,
    });
  }

  for (const r of (recovery ?? []) as Record<string, unknown>[]) {
    const storeId = s(r.store_id);
    const st = s(r.status).toUpperCase();
    events.push({
      id: `rec:${s(r.id)}`,
      eventType: st === "CLEARED" ? "RECOVERY_CLEARED" : "RECOVERY_CREATED",
      at: s(r.updated_at) || s(r.created_at),
      storeId,
      storeName: storeNameById.get(storeId) ?? null,
      publicGiftNumber: null,
      instanceId: null,
      orderId: null,
      userId: null,
      userLabel: null,
      amount: n(r.amount_remaining) || n(r.amount_original),
      summary: st,
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  let filtered = events;
  if (storeFilter) filtered = filtered.filter((e) => e.storeId === storeFilter);
  if (eventFilter) filtered = filtered.filter((e) => e.eventType.includes(eventFilter));
  if (q) {
    filtered = filtered.filter((e) => {
      const hay = [
        e.eventType,
        e.storeName ?? "",
        e.publicGiftNumber ?? "",
        e.orderId ?? "",
        e.userLabel ?? "",
        e.summary,
      ]
        .join(" ")
        .toUpperCase();
      return hay.includes(q);
    });
  }

  return NextResponse.json({ ok: true, events: filtered.slice(0, 400) });
}
