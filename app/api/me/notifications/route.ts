import { type NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  isBuyerStoreCommerceNotificationRow,
  isOwnerStoreCommerceNotificationRow,
} from "@/lib/notifications/owner-store-commerce-notification-meta";
import {
  getCachedNotificationUnreadCount,
  invalidateNotificationUnreadCountCache,
  type UnreadCountMode,
} from "@/lib/notifications/notification-unread-count-cache";

export const dynamic = "force-dynamic";

function isUnreachableUpstreamError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(msg)) return true;
  const c = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  return /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo/i.test(c);
}

function sbOr503() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

const UNREAD_SCAN_CAP = 2500;

/**
 * GET ?unread_count_only=1 → { unread_count }
 * GET ?unread_count_only=1&exclude_owner_store_commerce=1 → 소비자·일반 알림만 (매장 오너 전용 매장주문 알림 제외)
 * GET …&exclude_buyer_store_commerce=1 (위와 함께) → 하단 네비용: 구매자 매장주문(배송 단계 등) 미읽음 제외
 * GET ?unread_count_only=1&owner_store_commerce_unread_only=1 → 매장 오너용 매장주문 알림만
 * GET (기본) → 최근 알림 목록 (exclude_owner_store_commerce=1 지원)
 */
export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  if (searchParams.get("unread_count_only") === "1") {
    const excludeOwner = searchParams.get("exclude_owner_store_commerce") === "1";
    const excludeBuyerStore = searchParams.get("exclude_buyer_store_commerce") === "1";
    const ownerOnly = searchParams.get("owner_store_commerce_unread_only") === "1";
    const mode: UnreadCountMode = ownerOnly
      ? "owner_store_commerce"
      : excludeOwner && excludeBuyerStore
        ? "bottom_nav"
        : excludeOwner
          ? "consumer"
          : "all";

    try {
      const unreadCount = await getCachedNotificationUnreadCount(userId, mode, async () => {
        if (!excludeOwner && !ownerOnly) {
          const { count, error } = await sb
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("is_read", false);

          if (error) {
            if (error.message?.includes("notifications") && error.message.includes("does not exist")) {
              return 0;
            }
            throw error;
          }
          return count ?? 0;
        }

        const { data, error } = await sb
          .from("notifications")
          .select("id, meta")
          .eq("user_id", userId)
          .eq("is_read", false)
          .limit(UNREAD_SCAN_CAP);

        if (error) {
          if (error.message?.includes("notifications") && error.message.includes("does not exist")) {
            return 0;
          }
          if (error.message?.includes("meta") && error.message.includes("does not exist")) {
            const { count, error: cErr } = await sb
              .from("notifications")
              .select("*", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("is_read", false);
            if (cErr) {
              throw cErr;
            }
            const raw = count ?? 0;
            return ownerOnly ? 0 : raw;
          }
          throw error;
        }

        const rows = data ?? [];
        if (ownerOnly) {
          return rows.filter((r) => isOwnerStoreCommerceNotificationRow(r)).length;
        }
        if (mode === "bottom_nav") {
          return rows.filter(
            (r) =>
              !isOwnerStoreCommerceNotificationRow(r) && !isBuyerStoreCommerceNotificationRow(r)
          ).length;
        }
        return rows.filter((r) => !isOwnerStoreCommerceNotificationRow(r)).length;
      });

      return NextResponse.json({ ok: true, unread_count: unreadCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      const logPrefix = excludeOwner || ownerOnly
        ? "[GET notifications segmented count]"
        : "[GET notifications count]";
      if (isUnreachableUpstreamError(error)) {
        console.warn(
          `${logPrefix} Supabase unreachable (DNS/네트워크). .env 의 NEXT_PUBLIC_SUPABASE_URL 과 연결을 확인하세요.`
        );
        return NextResponse.json(
          { ok: false, error: "upstream_unreachable" },
          { status: 503 }
        );
      }
      console.error(logPrefix, error);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  const excludeOwnerList = searchParams.get("exclude_owner_store_commerce") === "1";
  const listLimit = excludeOwnerList ? 200 : 80;

  const q = sb
    .from("notifications")
    .select("id, notification_type, title, body, link_url, is_read, created_at, meta, domain, ref_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(listLimit);

  const { data, error } = await q;

  if (error) {
    if (error.message?.includes("notifications") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: true, notifications: [], table_missing: true });
    }
    const { data: rowsWithMeta, error: eMeta } = await sb
      .from("notifications")
      .select("id, notification_type, title, body, link_url, is_read, created_at, meta")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(listLimit);
    if (!eMeta) {
      let list = rowsWithMeta ?? [];
      if (excludeOwnerList) {
        list = list.filter((r) => !isOwnerStoreCommerceNotificationRow(r)).slice(0, 80);
      }
      return NextResponse.json({ ok: true, notifications: list });
    }
    const { data: rowsBare, error: eBare } = await sb
      .from("notifications")
      .select("id, notification_type, title, body, link_url, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(listLimit);
    if (!eBare) {
      let list = rowsBare ?? [];
      if (excludeOwnerList) {
        list = list.slice(0, 80);
      }
      return NextResponse.json({ ok: true, notifications: list });
    }
    console.error("[GET notifications]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let notifications = data ?? [];
  if (excludeOwnerList) {
    notifications = notifications.filter((r) => !isOwnerStoreCommerceNotificationRow(r)).slice(0, 80);
  }

  return NextResponse.json({ ok: true, notifications });
}

type PatchBody = {
  mark_all_read?: boolean;
  /** /my/notifications 목록에 맞춰, 매장 오너 전용 매장주문 알림은 읽음 처리하지 않음 */
  mark_my_notifications_read_excluding_owner_commerce?: boolean;
  /** 매장 사업자가 주문 관리로 들어올 때(종·알림 바로가기) 오너 전용 매장주문 알림만 일괄 읽음 */
  mark_all_owner_store_commerce_read?: boolean;
  ids?: string[];
};

/** 읽음 처리 */
export async function PATCH(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.mark_all_read === true) {
    const { error } = await sb
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      if (error.message?.includes("notifications") && error.message.includes("does not exist")) {
        return NextResponse.json({ ok: true, updated: 0 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    invalidateNotificationUnreadCountCache(userId);
    return NextResponse.json({ ok: true, updated: "all" });
  }

  if (body.mark_all_owner_store_commerce_read === true) {
    const { data, error } = await sb
      .from("notifications")
      .select("id, meta")
      .eq("user_id", userId)
      .eq("is_read", false)
      .limit(500);
    if (error) {
      if (error.message?.includes("meta") && error.message.includes("does not exist")) {
        return NextResponse.json({ ok: true, updated: 0 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const ids = (data ?? [])
      .filter((r) => isOwnerStoreCommerceNotificationRow(r))
      .map((r) => r.id as string)
      .filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }
    const { error: uErr } = await sb
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .in("id", ids);
    if (uErr) {
      return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
    }
    invalidateNotificationUnreadCountCache(userId);
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  if (body.mark_my_notifications_read_excluding_owner_commerce === true) {
    const { data, error } = await sb
      .from("notifications")
      .select("id, meta")
      .eq("user_id", userId)
      .eq("is_read", false)
      .limit(500);
    if (error) {
      if (error.message?.includes("meta") && error.message.includes("does not exist")) {
        const { error: uErr } = await sb
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", userId)
          .eq("is_read", false);
        if (uErr) {
          return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
        }
        invalidateNotificationUnreadCountCache(userId);
        return NextResponse.json({ ok: true, updated: "all_meta_missing_assumed_consumer" });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const ids = (data ?? [])
      .filter((r) => !isOwnerStoreCommerceNotificationRow(r))
      .map((r) => r.id as string)
      .filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }
    const { error: uErr } = await sb
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .in("id", ids);
    if (uErr) {
      return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
    }
    invalidateNotificationUnreadCountCache(userId);
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x).trim()).filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "ids_or_mark_all_required" }, { status: 400 });
  }

  const { error } = await sb
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .in("id", ids);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  invalidateNotificationUnreadCountCache(userId);
  return NextResponse.json({ ok: true, updated: ids.length });
}
