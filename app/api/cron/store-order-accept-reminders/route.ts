import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { createStoreOrderEvent } from "@/lib/stores/store-order-events";
import { notifyStoreOwnerAcceptReminder } from "@/lib/notifications/notify-store-commerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PendingOrderRow = {
  id: string;
  store_id: string;
  order_no: string | null;
  payment_amount: number | null;
  created_at: string | null;
  store_order_items?: Array<{ qty?: number | null }> | null;
};

function nowMs(): number {
  return Date.now();
}

function elapsedSec(createdAt: string | null | undefined, now: number): number {
  const t = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 1000));
}

function lineCountFromRow(row: PendingOrderRow): number {
  const list = Array.isArray(row.store_order_items) ? row.store_order_items : [];
  const total = list.reduce((sum, item) => sum + Math.max(0, Number(item.qty ?? 0) || 0), 0);
  return Math.max(1, total || list.length || 1);
}

async function runReminders(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("store_orders")
    .select("id, store_id, order_no, payment_amount, created_at, store_order_items(qty)")
    .eq("order_status", "pending")
    .eq("payment_status", "paid")
    .lte("created_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PendingOrderRow[];
  const now = nowMs();
  let reminded30 = 0;
  let reminded60 = 0;

  for (const row of rows) {
    const elapsed = elapsedSec(row.created_at, now);
    const buckets: Array<30 | 60> = [];
    if (elapsed >= 30) buckets.push(30);
    if (elapsed >= 60) buckets.push(60);
    if (buckets.length === 0) continue;

    const orderId = String(row.id ?? "").trim();
    const storeId = String(row.store_id ?? "").trim();
    if (!orderId || !storeId) continue;

    for (const bucket of buckets) {
      const ev = await createStoreOrderEvent(sb as SupabaseClient<any>, {
        orderId,
        storeId,
        actorRole: "system",
        actorUserId: null,
        eventType: "system_note",
        fromStatus: "pending",
        toStatus: "pending",
        dedupeKey: `${orderId}:owner_accept_reminder:${bucket}s`,
        metadata: {
          source: "cron_store_order_accept_reminder",
          reminder_bucket_sec: bucket,
        },
      });
      if (!ev.ok || !ev.inserted) continue;

      await notifyStoreOwnerAcceptReminder(sb as SupabaseClient<any>, {
        storeId,
        orderId,
        orderNo: String(row.order_no ?? ""),
        paymentAmount: Math.round(Number(row.payment_amount ?? 0) || 0),
        lineCount: lineCountFromRow(row),
        reminderBucketSec: bucket,
        storeOrderEventId: ev.row.id,
      });
      if (bucket === 30) reminded30 += 1;
      if (bucket === 60) reminded60 += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    reminded_30s: reminded30,
    reminded_60s: reminded60,
  });
}

export async function GET(req: Request) {
  return runReminders(req);
}

export async function POST(req: Request) {
  return runReminders(req);
}
