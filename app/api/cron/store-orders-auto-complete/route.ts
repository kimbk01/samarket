import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { notifyBuyerStoreOrderAutoCompleted } from "@/lib/notifications/notify-store-commerce";
import { appendStoreOrderMessengerStatusTransition } from "@/lib/community-messenger/store-order-chat-service";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import {
  buildStoreOrderAutoCompleteDedupeKey,
  createStoreOrderEvent,
} from "@/lib/stores/store-order-events";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTO_COMPLETE_SOURCE = "cron_store_orders_auto_complete" as const;

/**
 * 자동 구매확정: paid + (픽업준비·픽업 주문 | 배송지도착 | 구버전 배송중) + auto_complete_at <= now → completed
 *
 * 인증: Authorization: Bearer <CRON_SECRET> 또는 x-cron-secret
 * Vercel Cron은 GET으로 호출되며, 프로젝트에 CRON_SECRET이 있으면 같은 값이 Bearer로 전달됩니다.
 *
 * 주문별 조건부 업데이트 + `store_order_events` dedupe(`orderId:order_auto_completed`) 후 알림 1회.
 */
async function runStoreOrdersAutoComplete(req: Request) {
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

  const now = new Date().toISOString();

  const { data: due, error } = await sb
    .from("store_orders")
    .select("id, buyer_user_id, order_no, store_id, order_status")
    .eq("payment_status", "paid")
    .in("order_status", ["ready_for_pickup", "delivering", "arrived"])
    .not("auto_complete_at", "is", null)
    .lte("auto_complete_at", now);

  if (error) {
    if (error.message?.includes("auto_complete_at") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "column_missing_apply_migration" }, { status: 503 });
    }
    console.error("[cron store-orders-auto-complete]", error);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(error.message) },
      { status: 500 }
    );
  }

  const completedIds: string[] = [];

  for (const row of due ?? []) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const prevStatus = String(row.order_status ?? "").trim();
    const sid = String(row.store_id ?? "").trim();
    if (!sid) continue;

    const { data: updated, error: uErr } = await sb
      .from("store_orders")
      .update({ order_status: "completed", auto_complete_at: null })
      .eq("id", id)
      .eq("payment_status", "paid")
      .in("order_status", ["ready_for_pickup", "delivering", "arrived"])
      .not("auto_complete_at", "is", null)
      .lte("auto_complete_at", now)
      .select("id")
      .maybeSingle();

    if (uErr) {
      console.error("[cron store-orders-auto-complete update]", id, uErr);
      continue;
    }
    if (!updated) continue;

    completedIds.push(id);

    const ev = await createStoreOrderEvent(sb, {
      orderId: id,
      storeId: sid,
      actorUserId: null,
      actorRole: "system",
      eventType: "order_completed",
      fromStatus: prevStatus || null,
      toStatus: "completed",
      dedupeKey: buildStoreOrderAutoCompleteDedupeKey(id),
      metadata: { source: AUTO_COMPLETE_SOURCE },
    });

    const bid = row.buyer_user_id as string | undefined;
    if (ev.ok && ev.inserted && bid) {
      void notifyBuyerStoreOrderAutoCompleted(sb, {
        buyerUserId: bid,
        orderId: id,
        orderNo: String(row.order_no ?? ""),
        storeId: sid,
        storeOrderEventId: ev.row.id,
      });
    }
    if (!ev.ok && bid) {
      /** 이벤트 원장 삽입 실패 시에도 알림은 dedupe_key(order_id 기반)로 1회만 */
      void notifyBuyerStoreOrderAutoCompleted(sb, {
        buyerUserId: bid,
        orderId: id,
        orderNo: String(row.order_no ?? ""),
        storeId: sid,
      });
    }
    try {
      await appendStoreOrderMessengerStatusTransition(
        sb as import("@supabase/supabase-js").SupabaseClient<any>,
        id,
        prevStatus,
        "completed"
      );
    } catch {
      /* ignore */
    }
  }

  const rm = getAuditRequestMeta(req);
  const idSample = completedIds.slice(0, 80);
  void appendAuditLog(sb, {
    actor_type: "system",
    actor_id: null,
    target_type: "cron_job",
    target_id: "store-orders-auto-complete",
    action: "store_order.cron_auto_complete",
    after_json: {
      completed_count: completedIds.length,
      order_ids: idSample,
      truncated: completedIds.length > idSample.length,
    },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, completed: completedIds.length, order_ids: completedIds });
}

export async function GET(req: Request) {
  return runStoreOrdersAutoComplete(req);
}

export async function POST(req: Request) {
  return runStoreOrdersAutoComplete(req);
}
