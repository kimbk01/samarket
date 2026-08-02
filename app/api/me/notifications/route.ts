import { type NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";
import {
  getCachedNotificationUnreadCount,
  getCachedNotificationUnreadCountBySurface,
  invalidateNotificationUnreadCountCache,
  isBadgeSurfaceQueryParam,
  type UnreadCountMode,
} from "@/lib/notifications/notification-unread-count-cache";
import { isInAppChatMessageNotificationRow } from "@/lib/notifications/inapp-chat-message-notification";
import {
  countNotificationTargetsSurfaceServer,
  countNotificationUnreadSegmentedServer,
} from "@/lib/notifications/fetch-segmented-unread-count-server";
import {
  tryLoadOwnerStoreCommerceUnreadFromSnapshot,
  tryLoadOwnerStoreNotificationsFromSnapshot,
} from "@/lib/notifications/owner-dashboard-notifications-snapshot";
import {
  buildOwnerDashboardPerfV2,
  logOwnerDashboardPerfV2,
} from "@/lib/stores/owner-dashboard-perf-v2";
import {
  buildPerfMeasureResponseHeaders,
  isOwnerDashboardMeasureInvalidateEnabled,
} from "@/lib/performance/prod-same-region-perf";
import { jsonPayloadBytes, logOwnerDashboardPerf, perfNowMs } from "@/lib/stores/owner-dashboard-perf";
import {
  fetchNotificationEventsForInbox,
} from "@/lib/notifications/inbox-events-merge";
import { countNotificationEventsBadge } from "@/lib/notifications/core/notification-event-repository";
import {
  clearChatInboxTargetsAfterMarkAll,
  deleteAllMemberANotificationEvents,
  markChatNotificationEventsRead,
  markNonChatNonOwnerNotificationEventsRead,
  markOwnerStoreCommerceNotificationEventsRead,
  patchInboxNotificationIdsDelete,
  patchInboxNotificationIdsRead,
} from "@/lib/notifications/inbox-read-bridge";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";

export const runtime = "nodejs";
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

const INBOX_PUSH_KIND_PARAMS = new Set([
  "chat",
  "trade",
  "delivery",
  "community",
  "notice",
  "marketing",
  "system",
]);

/**
 * GET ?unread_count_only=1 → { unread_count }
 * GET ?unread_count_only=1&exclude_owner_store_commerce=1 → 소비자·일반 알림만 (매장 오너 전용 매장주문 알림 제외)
 * GET …&exclude_buyer_store_commerce=1 (위와 함께) → 하단 네비용: 구매자 매장주문(배송 단계 등) 미읽음 제외
 * GET ?unread_count_only=1&owner_store_commerce_unread_only=1 → 매장 오너용 매장주문 알림만
 * GET (기본) → 최근 알림 목록 (exclude_owner_store_commerce=1 지원)
 * GET …&limit=40&offset=0&push_kind=trade → 페이지네이션·종류 필터 (push_kind 컬럼 필요; 채팅은 push_kind 또는 notification_type)
 * GET ?unread_count_only=1&badge_surface=bottom_nav_delivery → notification_targets surface count (no legacy fallback)
 * GET ?owner_store_id=UUID → 해당 매장의 오너 매장주문(commerce·meta.kind) 알림만 (최대 200건)
 */
export async function GET(req: NextRequest) {
  const wall0 = perfNowMs();
  const { searchParams } = new URL(req.url);
  const auth0 = perfNowMs();
  const userId = await getRouteUserId();
  const auth_ms = Math.round(perfNowMs() - auth0);

  /** 비로그인: 미읽음 개수만 요청할 때는 401 대신 0 — 헤더/폴링이 세션 전에 닿는 노이즈 제거 */
  if (searchParams.get("unread_count_only") === "1" && !userId) {
    return NextResponse.json({ ok: true, unread_count: 0 });
  }

  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const sbx = sb;
  const inboxUserId = userId;

  if (
    isOwnerDashboardMeasureInvalidateEnabled() &&
    req.headers.get("x-samarket-notifications-measure") === "1"
  ) {
    invalidateNotificationUnreadCountCache(userId);
  }

  const ownerNotificationsBypass =
    searchParams.get("ownerNotificationsBypass") === "1" && process.env.NODE_ENV === "development";
  if (ownerNotificationsBypass) {
    invalidateNotificationUnreadCountCache(userId);
  }

  if (searchParams.get("unread_count_only") === "1") {
    const db0 = perfNowMs();
    const badgeSurfaceRaw = searchParams.get("badge_surface")?.trim() ?? "";
    const badgeSurface = isBadgeSurfaceQueryParam(badgeSurfaceRaw) ? badgeSurfaceRaw : null;
    const badgeStoreId = searchParams.get("owner_store_id")?.trim() || null;

    if (badgeSurface && badgeSurface !== "all") {
      try {
        const { value: unreadCount, cache_hit: notifCacheHit, singleflight_hit: notifSingleflightHit } =
          await getCachedNotificationUnreadCountBySurface(
            userId,
            badgeSurface,
            badgeStoreId,
            async () =>
              countNotificationTargetsSurfaceServer(sbx, userId, badgeSurface, badgeStoreId)
          );

        const db_ms = Math.round(perfNowMs() - db0);
        const total_ms = Math.round(perfNowMs() - wall0);
        const body = { ok: true as const, unread_count: unreadCount };
        logOwnerDashboardPerfV2(
          buildOwnerDashboardPerfV2({
            route: "/api/me/notifications",
            total_ms,
            auth_ms,
            notification_count_ms: notifCacheHit ? 0 : db_ms,
            cache_hit: notifCacheHit ? 1 : 0,
            singleflight_hit: notifSingleflightHit ? 1 : 0,
            first_paint_blocking: req.headers.get("x-samarket-first-paint-blocking") !== "0",
            db_round_trips: notifCacheHit ? 0 : 1,
            notifications_via: "notification_targets_surface",
            stages: [{ stage: "notification_targets_surface", ms: db_ms }],
          })
        );
        return NextResponse.json(body, {
          headers: buildPerfMeasureResponseHeaders({
            actual_handler_ms: total_ms,
            cache_hit: notifCacheHit ? 1 : 0,
          }),
        });
      } catch (e) {
        if (isUnreachableUpstreamError(e)) {
          return NextResponse.json({ ok: false, error: "upstream_unreachable" }, { status: 503 });
        }
        throw e;
      }
    }

    const excludeOwner = searchParams.get("exclude_owner_store_commerce") === "1";
    const excludeBuyerStore = searchParams.get("exclude_buyer_store_commerce") === "1";
    const excludeChatMessage = searchParams.get("exclude_chat_message") === "1";
    const ownerOnly = searchParams.get("owner_store_commerce_unread_only") === "1";
    const mode: UnreadCountMode = ownerOnly
      ? "owner_store_commerce"
      : excludeOwner && excludeBuyerStore && excludeChatMessage
        ? "bottom_nav_no_chat"
      : excludeOwner && excludeBuyerStore
        ? "bottom_nav"
        : excludeOwner && excludeChatMessage
          ? "consumer_no_chat"
        : excludeOwner
          ? "consumer"
          : "all";

    try {
      if (ownerOnly) {
        const snapUnread = await tryLoadOwnerStoreCommerceUnreadFromSnapshot(sbx, userId);
        if (snapUnread) {
          const db_ms = snapUnread.breakdown.db_ms;
          const total_ms = Math.round(perfNowMs() - wall0);
          const body = { ok: true as const, unread_count: snapUnread.unreadCount };
          logOwnerDashboardPerf({
            route: "/api/me/notifications",
            total_ms,
            auth_ms,
            db_ms,
            count_ms: db_ms,
            cache_hit: snapUnread.breakdown.cache_hit,
            owner_store_commerce_unread_only: 1,
            result_count: snapUnread.unreadCount,
            payload_bytes: jsonPayloadBytes(body),
          });
          logOwnerDashboardPerfV2(
            buildOwnerDashboardPerfV2({
              route: "/api/me/notifications",
              total_ms,
              auth_ms,
              notification_count_ms: db_ms,
              cache_hit: snapUnread.breakdown.cache_hit,
              singleflight_hit: 0,
              first_paint_blocking: req.headers.get("x-samarket-first-paint-blocking") !== "0",
              db_round_trips: 1,
              notifications_via: "owner_notifications_snapshot",
              stages: [{ stage: "notification_count", ms: db_ms }],
            })
          );
          return NextResponse.json(body, {
            headers: {
              ...buildPerfMeasureResponseHeaders({
                actual_handler_ms: total_ms,
                cache_hit: snapUnread.breakdown.cache_hit,
              }),
              "x-samarket-owner-notifications-snapshot-path": "1",
              "x-samarket-owner-notifications-snapshot-via":
                snapUnread.breakdown.snapshot_via ?? "unified_rpc",
              "x-samarket-owner-notifications-query-wave-2-ms": "0",
              "x-samarket-owner-notifications-rpc-removed": "1",
            },
          });
        }
        return NextResponse.json(
          { ok: false, error: "snapshot_unavailable" },
          { status: 503 }
        );
      }

      const { value: unreadCount, cache_hit: notifCacheHit, singleflight_hit: notifSingleflightHit } =
        await getCachedNotificationUnreadCount(userId, mode, async () =>
          countNotificationUnreadSegmentedServer(sbx, userId, mode)
        );

      const db_ms = Math.round(perfNowMs() - db0);
      const total_ms = Math.round(perfNowMs() - wall0);
      const cache_hit: 0 | 1 = notifCacheHit ? 1 : 0;
      const body = { ok: true as const, unread_count: unreadCount };
      if (ownerOnly || excludeOwner) {
        logOwnerDashboardPerf({
          route: "/api/me/notifications",
          total_ms,
          auth_ms,
          db_ms,
          count_ms: db_ms,
          cache_hit,
          owner_store_commerce_unread_only: ownerOnly ? 1 : 0,
          exclude_owner_store_commerce: excludeOwner ? 1 : 0,
          result_count: unreadCount,
          payload_bytes: jsonPayloadBytes(body),
        });
      }
      logOwnerDashboardPerfV2(
        buildOwnerDashboardPerfV2({
          route: "/api/me/notifications",
          total_ms,
          auth_ms,
          notification_count_ms: cache_hit ? 0 : db_ms,
          cache_hit,
          singleflight_hit: notifSingleflightHit ? 1 : 0,
          first_paint_blocking: req.headers.get("x-samarket-first-paint-blocking") !== "0",
          db_round_trips: cache_hit ? 0 : 1,
          notifications_via: cache_hit ? "cache" : "rpc_segmented",
          stages: [{ stage: "notification_count", ms: cache_hit ? 0 : db_ms }],
        })
      );
      return NextResponse.json(body, {
        headers: buildPerfMeasureResponseHeaders({
          actual_handler_ms: total_ms,
          cache_hit,
        }),
      });
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
  const excludeChatMessageList = searchParams.get("exclude_chat_message") === "1";
  const excludeMissedCallList = searchParams.get("exclude_missed_call") === "1";
  const ownerStoreId = searchParams.get("owner_store_id")?.trim() ?? "";
  const ownerListDb0 = ownerStoreId ? perfNowMs() : 0;

  if (ownerStoreId) {
    const listRpc0 = perfNowMs();
    const snapList = await tryLoadOwnerStoreNotificationsFromSnapshot(sbx, userId, ownerStoreId, 200);
    if (snapList) {
      const listRpcMs = Math.round(perfNowMs() - listRpc0);
      const notifications = snapList.notifications;
      const body = { ok: true as const, notifications };
      logOwnerDashboardPerf({
        route: "/api/me/notifications",
        store_id: ownerStoreId,
        total_ms: Math.round(perfNowMs() - wall0),
        auth_ms,
        db_ms: listRpcMs,
        list_ms: listRpcMs,
        result_count: notifications.length,
        payload_bytes: jsonPayloadBytes(body),
      });
      logOwnerDashboardPerfV2(
        buildOwnerDashboardPerfV2({
          route: "/api/me/notifications",
          total_ms: Math.round(perfNowMs() - wall0),
          auth_ms,
          notification_count_ms: listRpcMs,
          cache_hit: snapList.breakdown.cache_hit,
          db_round_trips: 1,
          notifications_via: "owner_notifications_snapshot",
          stages: [{ stage: "owner_store_list", ms: listRpcMs }],
        })
      );
      return NextResponse.json(body, {
        headers: {
          "x-samarket-owner-notifications-snapshot-path": "1",
          "x-samarket-owner-notifications-snapshot-via": snapList.breakdown.snapshot_via ?? "unified_rpc",
          "x-samarket-owner-notifications-query-wave-2-ms": "0",
          "x-samarket-owner-notifications-rpc-removed": "1",
        },
      });
    }
    return NextResponse.json(
      { ok: false, error: "snapshot_unavailable" },
      { status: 503 }
    );
  }

  const rawLimitParam = searchParams.get("limit");
  const rawOffsetParam = searchParams.get("offset");
  const inboxPushKindRaw = searchParams.get("push_kind")?.trim().toLowerCase() ?? "";
  const inboxPushKind =
    !ownerStoreId && inboxPushKindRaw && INBOX_PUSH_KIND_PARAMS.has(inboxPushKindRaw) ? inboxPushKindRaw : null;

  const parsedLimit = rawLimitParam != null ? Number.parseInt(rawLimitParam, 10) : NaN;
  const parsedOffset = rawOffsetParam != null ? Number.parseInt(rawOffsetParam, 10) : 0;
  const explicitPage = !ownerStoreId && Number.isFinite(parsedLimit) && parsedLimit > 0;
  const listOffset =
    explicitPage && Number.isFinite(parsedOffset) && parsedOffset >= 0 ? Math.min(parsedOffset, 5000) : 0;

  /** 매장 오너 전용 목록은 최근 건을 가져온 뒤 `meta.store_id` 로 좁힘 */
  let fetchUpper = ownerStoreId ? 220 : excludeOwnerList ? 200 : 80;
  let displayCap = fetchUpper;
  if (explicitPage) {
    displayCap = Math.min(parsedLimit, 100);
    fetchUpper = displayCap + 1;
  }

  /**
   * Bell Inbox Authority LOCK (2026-07-31 Phase 2):
   * List rows = notification_events only — same Authority as Bell digit.
   * DO NOT merge legacy `notifications` unread into product Bell list.
   * Legacy table remains history / PATCH mark-all compatibility only (not list SSOT).
   */
  const mergeFetchUpper = explicitPage ? listOffset + displayCap + 1 : fetchUpper;

  const eventInboxOpts = {
    fetchUpper: mergeFetchUpper,
    inboxPushKind: inboxPushKind as import("@/lib/me/fetch-me-notifications-deduped").InboxPushKindFilter | null,
    excludeOwnerList,
    excludeChatMessageList,
    excludeMissedCallList,
    ownerStoreId: ownerStoreId || undefined,
  };

  const [eventRows, badgeCount] = await Promise.all([
    fetchNotificationEventsForInbox(sbx, inboxUserId, eventInboxOpts),
    countNotificationEventsBadge(sbx, inboxUserId),
  ]);

  let notifications = eventRows;
  if (explicitPage) {
    notifications = notifications.slice(listOffset, listOffset + displayCap + 1);
  } else if (!ownerStoreId) {
    notifications = notifications.slice(0, excludeOwnerList ? 80 : fetchUpper);
  }

  const unreadTotal = Math.max(0, Math.floor(Number(badgeCount.total) || 0));

  if (explicitPage) {
    const hasMore = notifications.length > displayCap;
    notifications = notifications.slice(0, displayCap);
    const unreadLoaded = notifications.filter((r) => !r.is_read).length;
    const body = {
      ok: true as const,
      notifications,
      has_more: hasMore,
      unread_total: unreadTotal,
      unread_loaded: unreadLoaded,
      authority: "notification_events" as const,
      legacy_merge: false as const,
    };
    if (ownerStoreId) {
      logOwnerDashboardPerf({
        route: "/api/me/notifications",
        store_id: ownerStoreId,
        total_ms: Math.round(perfNowMs() - wall0),
        auth_ms,
        db_ms: Math.round(perfNowMs() - ownerListDb0),
        list_ms: Math.round(perfNowMs() - ownerListDb0),
        result_count: notifications.length,
        payload_bytes: jsonPayloadBytes(body),
      });
    }
    return NextResponse.json(body);
  }

  const unreadLoaded = notifications.filter((r) => !r.is_read).length;
  const body = {
    ok: true as const,
    notifications,
    unread_total: unreadTotal,
    unread_loaded: unreadLoaded,
    authority: "notification_events" as const,
    legacy_merge: false as const,
  };
  if (ownerStoreId) {
    logOwnerDashboardPerf({
      route: "/api/me/notifications",
      store_id: ownerStoreId,
      total_ms: Math.round(perfNowMs() - wall0),
      auth_ms,
      db_ms: Math.round(perfNowMs() - ownerListDb0),
      list_ms: Math.round(perfNowMs() - ownerListDb0),
      result_count: notifications.length,
      payload_bytes: jsonPayloadBytes(body),
    });
  }
  return NextResponse.json(body);
}

type PatchBody = {
  /** 해당 id들만 삭제 (본인 알림만, 최대 200건) */
  delete_ids?: string[];
  /** Member A 전체 삭제 — chat/missed/owner 제외 */
  delete_all_member_a?: boolean;
  mark_all_read?: boolean;
  /** /my/notifications 목록에 맞춰, 매장 오너 전용 매장주문 알림은 읽음 처리하지 않음 */
  mark_my_notifications_read_excluding_owner_commerce?: boolean;
  /** 헤더 종(벨) 전용: 채팅 메시지(notification_type=chat)는 제외하고 읽음 처리 */
  mark_my_notifications_read_excluding_owner_and_chat?: boolean;
  /** bottom_nav_chat surface fallback — 채팅 알림만 일괄 읽음 */
  mark_my_chat_notifications_read?: boolean;
  /** 매장 사업자가 주문 관리로 들어올 때(종·알림 바로가기) 오너 전용 매장주문 알림만 일괄 읽음 */
  mark_all_owner_store_commerce_read?: boolean;
  ids?: string[];
};

const DELETE_IDS_CAP = 200;

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

  const rawDelete =
    Array.isArray(body.delete_ids) ? body.delete_ids.map((x) => String(x).trim()).filter(Boolean) : [];
  const deleteIds = [...new Set(rawDelete)].slice(0, DELETE_IDS_CAP);
  if (deleteIds.length > 0) {
    const deleteResult = await patchInboxNotificationIdsDelete(sb, userId, deleteIds);
    if (!deleteResult.ok) {
      return NextResponse.json({ ok: false, error: deleteResult.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, deleted: deleteResult.deleted });
  }

  if (body.delete_all_member_a === true) {
    const deletedEvents = await deleteAllMemberANotificationEvents(sb, userId);
    const { data: legacyRows, error: legacySelErr } = await sb
      .from("notifications")
      .select("id, meta, notification_type, push_kind")
      .eq("user_id", userId)
      .limit(500);
    let deletedLegacy = 0;
    if (!legacySelErr && legacyRows?.length) {
      const legacyIds = legacyRows
        .filter((r) => {
          if (isOwnerStoreCommerceNotificationRow(r)) return false;
          if (isInAppChatMessageNotificationRow(r)) return false;
          const kind = String(
            (r.meta && typeof r.meta === "object" ? (r.meta as { kind?: unknown }).kind : "") ?? ""
          )
            .trim()
            .toLowerCase();
          const nt = String(r.notification_type ?? "").trim().toLowerCase();
          if (kind === "missed_call" || nt === "missed_call") return false;
          return true;
        })
        .map((r) => r.id as string)
        .filter(Boolean);
      if (legacyIds.length > 0) {
        const { data: deletedRows, error } = await sb
          .from("notifications")
          .delete()
          .eq("user_id", userId)
          .in("id", legacyIds)
          .select("id");
        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        deletedLegacy = deletedRows?.length ?? 0;
      }
    }
    invalidateNotificationUnreadCountCache(userId);
    invalidateNotificationBadgeCache(userId);
    return NextResponse.json({
      ok: true,
      deleted: deletedEvents + deletedLegacy,
      deleted_events: deletedEvents,
      deleted_legacy: deletedLegacy,
    });
  }

  if (body.mark_all_read === true) {
    // Member A mark-all only — not chat (B), missed (B), owner commerce (Owner).
    await markNonChatNonOwnerNotificationEventsRead(sb, userId);
    const { data: legacyRows, error: legacySelErr } = await sb
      .from("notifications")
      .select("id, meta, notification_type, push_kind")
      .eq("user_id", userId)
      .eq("is_read", false)
      .limit(500);
    if (legacySelErr) {
      if (
        legacySelErr.message?.includes("notifications") &&
        legacySelErr.message.includes("does not exist")
      ) {
        invalidateNotificationUnreadCountCache(userId);
        invalidateNotificationBadgeCache(userId);
        return NextResponse.json({ ok: true, updated: "member_events" });
      }
      return NextResponse.json({ ok: false, error: legacySelErr.message }, { status: 500 });
    }
    const legacyIds = (legacyRows ?? [])
      .filter((r) => {
        if (isOwnerStoreCommerceNotificationRow(r)) return false;
        if (isInAppChatMessageNotificationRow(r)) return false;
        const kind = String(
          (r.meta && typeof r.meta === "object" ? (r.meta as { kind?: unknown }).kind : "") ?? ""
        )
          .trim()
          .toLowerCase();
        const nt = String(r.notification_type ?? "").trim().toLowerCase();
        if (kind === "missed_call" || nt === "missed_call") return false;
        return true;
      })
      .map((r) => r.id as string)
      .filter(Boolean);
    if (legacyIds.length > 0) {
      const { error } = await sb
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .in("id", legacyIds);
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    }
    invalidateNotificationUnreadCountCache(userId);
    invalidateNotificationBadgeCache(userId);
    return NextResponse.json({ ok: true, updated: "member_all" });
  }

  if (body.mark_all_owner_store_commerce_read === true) {
    const { data, error } = await sb
      .from("notifications")
      .select("id, meta, ref_id")
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
    const storeIds = [
      ...new Set(
        (data ?? [])
          .filter((r) => isOwnerStoreCommerceNotificationRow(r))
          .map((r) => {
            const meta = r.meta;
            if (!meta || typeof meta !== "object") return "";
            return String((meta as Record<string, unknown>).store_id ?? "").trim();
          })
          .filter(Boolean)
      ),
    ];
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
    const orderIds = [
      ...new Set(
        (data ?? [])
          .filter((r) => isOwnerStoreCommerceNotificationRow(r))
          .map((r) => {
            const meta = r.meta;
            if (!meta || typeof meta !== "object") return "";
            return String((meta as Record<string, unknown>).order_id ?? r.ref_id ?? "").trim();
          })
          .filter(Boolean)
      ),
    ];
    try {
      const { clearNotificationTarget } = await import("@/lib/notifications/notification-targets");
      for (const orderId of orderIds) {
        const storeIdForOrder = (data ?? [])
          .filter((r) => isOwnerStoreCommerceNotificationRow(r))
          .map((r) => {
            const meta = r.meta;
            if (!meta || typeof meta !== "object") return "";
            const oid = String((meta as Record<string, unknown>).order_id ?? r.ref_id ?? "").trim();
            if (oid !== orderId) return "";
            return String((meta as Record<string, unknown>).store_id ?? "").trim();
          })
          .find(Boolean);
        await clearNotificationTarget(sb, {
          userId,
          targetType: "owner_order",
          targetId: orderId,
          storeId: storeIdForOrder || null,
        });
      }
    } catch {
      /* badge target clear best-effort */
    }
    await markOwnerStoreCommerceNotificationEventsRead(sb, userId, orderIds);
    invalidateNotificationUnreadCountCache(userId);
    invalidateNotificationBadgeCache(userId);
    for (const storeId of storeIds) {
      invalidateNotificationUnreadCountCache(userId, storeId);
    }
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

  if (body.mark_my_chat_notifications_read === true) {
    type MarkReadScanRow = {
      id?: unknown;
      meta?: unknown;
      notification_type?: string;
      push_kind?: unknown;
    };

    const markWithPk = await sb
      .from("notifications")
      .select("id, meta, notification_type, push_kind")
      .eq("user_id", userId)
      .eq("is_read", false)
      .limit(500);
    let data = markWithPk.data as MarkReadScanRow[] | null;
    let error = markWithPk.error;
    if (
      error &&
      /push_kind|column|schema cache/i.test(String(error.message ?? ""))
    ) {
      const markFallback = await sb
        .from("notifications")
        .select("id, meta, notification_type")
        .eq("user_id", userId)
        .eq("is_read", false)
        .limit(500);
      data = markFallback.data as MarkReadScanRow[] | null;
      error = markFallback.error;
    }
    if (error) {
      if (error.message?.includes("meta") && error.message.includes("does not exist")) {
        return NextResponse.json({ ok: true, updated: 0 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const ids = (data ?? [])
      .filter((r) => isInAppChatMessageNotificationRow(r))
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
    await markChatNotificationEventsRead(sb, userId);
    await clearChatInboxTargetsAfterMarkAll(sb, userId);
    invalidateNotificationUnreadCountCache(userId);
    invalidateNotificationBadgeCache(userId);
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  if (body.mark_my_notifications_read_excluding_owner_and_chat === true) {
    type MarkReadScanRow = {
      id?: unknown;
      meta?: unknown;
      notification_type?: string;
      push_kind?: unknown;
    };

    const markWithPk = await sb
      .from("notifications")
      .select("id, meta, notification_type, push_kind")
      .eq("user_id", userId)
      .eq("is_read", false)
      .limit(500);
    let data = markWithPk.data as MarkReadScanRow[] | null;
    let error = markWithPk.error;
    if (
      error &&
      /push_kind|column|schema cache/i.test(String(error.message ?? ""))
    ) {
      const markFallback = await sb
        .from("notifications")
        .select("id, meta, notification_type")
        .eq("user_id", userId)
        .eq("is_read", false)
        .limit(500);
      data = markFallback.data as MarkReadScanRow[] | null;
      error = markFallback.error;
    }
    if (error) {
      if (error.message?.includes("meta") && error.message.includes("does not exist")) {
        return NextResponse.json({ ok: true, updated: 0 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const ids = (data ?? [])
      .filter((r) => !isOwnerStoreCommerceNotificationRow(r) && !isInAppChatMessageNotificationRow(r))
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
    await markNonChatNonOwnerNotificationEventsRead(sb, userId);
    invalidateNotificationUnreadCountCache(userId);
    invalidateNotificationBadgeCache(userId);
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x).trim()).filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "ids_or_mark_all_required" }, { status: 400 });
  }

  const readResult = await patchInboxNotificationIdsRead(sb, userId, ids);
  if (!readResult.ok) {
    return NextResponse.json({ ok: false, error: readResult.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: readResult.updated });
}
