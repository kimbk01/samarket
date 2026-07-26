import type { SupabaseClient } from "@supabase/supabase-js";
import { publishNotificationSideEffect } from "@/lib/notifications/publish-notification-side-effect";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { invalidateNotificationUnreadCountCache } from "@/lib/notifications/notification-unread-count-cache";
import {
  applyOwnerCommerceNotificationInvalidate,
  resolveOwnerCommerceNotificationStoreId,
} from "@/lib/delivery/owner/apply-owner-commerce-notification-invalidate";
import { bumpNotificationTargetFromInboxRow } from "@/lib/notifications/notification-target-from-inbox-row";
import { getBlockedRelation } from "@/lib/community-messenger/social-relations";
import { isNotificationSuppressedForActor } from "@/lib/social/user-block-ssot";
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";

const LEGACY_NOTIFICATIONS_FALLBACK_ENABLED = process.env.DIBAY_LEGACY_NOTIFICATIONS_MODE === "1";

function afterOwnerCommerceNotificationInserted(
  userId: string,
  meta: Record<string, unknown> | null | undefined
): void {
  const uid = userId.trim();
  const storeId = resolveOwnerCommerceNotificationStoreId(meta);
  invalidateNotificationUnreadCountCache(uid, storeId);
  applyOwnerCommerceNotificationInvalidate({
    ownerUserId: uid,
    storeId,
    meta,
    route: "append-user-notification",
    reason: "owner_commerce_notification",
  });
}

function afterNotificationInsertedSuccess(
  sb: SupabaseClient,
  row: {
    user_id: string;
    notification_type: AppNotificationType;
    title: string;
    body?: string | null;
    link_url?: string | null;
    ref_id?: string | null;
    meta?: Record<string, unknown> | null;
  },
  metaMerged: Record<string, unknown> | null
): void {
  const uid = row.user_id.trim();
  afterOwnerCommerceNotificationInserted(uid, metaMerged ?? undefined);
  void bumpNotificationTargetFromInboxRow(sb, {
    user_id: uid,
    notification_type: row.notification_type,
    ref_id: row.ref_id ?? null,
    meta: metaMerged,
  }).catch(() => {});
  void publishNotificationSideEffect(
    {
      user_id: uid,
      notification_type: row.notification_type,
      title: row.title,
      body: row.body ?? null,
      link_url: row.link_url ?? null,
      meta: metaMerged,
    },
    sb
  );
}

export type AppNotificationType =
  | "chat"
  | "status"
  | "review"
  | "report"
  | "system"
  | "commerce";

function toNotificationEventType(row: {
  notification_type: AppNotificationType;
  push_kind?: "chat" | "trade" | "delivery" | "community" | "notice" | "marketing" | "system" | null;
  meta?: Record<string, unknown> | null;
}): NotificationEventType {
  const pushKind = String(row.push_kind ?? "").trim();
  const metaKind = String(row.meta?.kind ?? "").trim();
  if (pushKind === "marketing") return "admin_marketing_banner";
  if (pushKind === "notice" || pushKind === "system") return "admin_notice";
  if (pushKind === "delivery") return "order_status";
  if (pushKind === "trade") return "trade_status";
  if (pushKind === "community") return "community_activity";
  if (metaKind === "trade_offer" || metaKind === "trade_reserved" || metaKind === "trade_completed") {
    return "trade_status";
  }
  if (metaKind === "group_chat" || metaKind === "community_group_invite") return "group_message";
  if (metaKind === "trade_chat") return "trade_message";
  if (metaKind === "community_chat") return "chat_message";
  if (row.notification_type === "chat") return "chat_message";
  if (row.notification_type === "commerce") return "order_status";
  if (row.notification_type === "status" || row.notification_type === "review" || row.notification_type === "report") {
    return "community_activity";
  }
  return "admin_notice";
}

function buildLegacyNotificationEventDedupeKey(row: {
  user_id: string;
  notification_type: AppNotificationType;
  dedupe_key?: string | null;
  ref_id?: string | null;
  link_url?: string | null;
  title: string;
  body?: string | null;
}): string {
  const explicit = typeof row.dedupe_key === "string" ? row.dedupe_key.trim() : "";
  if (explicit) return explicit;
  const refId = typeof row.ref_id === "string" ? row.ref_id.trim() : "";
  if (refId) return `legacy:${row.user_id}:${row.notification_type}:${refId}`;
  const link = typeof row.link_url === "string" ? row.link_url.trim() : "";
  const t = row.title.trim();
  const b = String(row.body ?? "").trim();
  return `legacy:${row.user_id}:${row.notification_type}:${link}:${t}:${b}`.slice(0, 200);
}

function extractActorUserIdFromNotificationRow(row: {
  sender_id?: string | null;
  meta?: Record<string, unknown> | null;
}): string | null {
  const sender = typeof row.sender_id === "string" ? row.sender_id.trim() : "";
  if (sender) return sender;
  const meta = row.meta;
  if (!meta || typeof meta !== "object") return null;
  for (const key of ["sender_id", "commenter_id", "liker_id", "actor_id"] as const) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

async function shouldSuppressNotificationForBlock(
  recipientUserId: string,
  actorUserId: string | null
): Promise<boolean> {
  const recipient = recipientUserId.trim();
  const actor = actorUserId?.trim() ?? "";
  if (!recipient || !actor || recipient === actor) return false;
  const relation = await getBlockedRelation(recipient, actor);
  return isNotificationSuppressedForActor(relation);
}

/**
 * 인앱 알림 1건 저장 (서비스 롤 클라이언트 권장).
 * 테이블/컬럼/체크 제약 불일치 시 로그만 남기고 무시 — 본 비즈니스 플로우는 계속.
 */
export async function appendUserNotification(
  sb: SupabaseClient,
  row: {
    user_id: string;
    notification_type: AppNotificationType;
    title: string;
    body?: string | null;
    link_url?: string | null;
    meta?: Record<string, unknown> | null;
    /** v1 도메인 — trade_chat / community_chat / order / store */
    domain?: NotificationDomain | null;
    ref_id?: string | null;
    /** 인박스·푸시 라우팅 (컬럼 없으면 meta.push_kind 로만 전달) */
    push_kind?: "chat" | "trade" | "delivery" | "community" | "notice" | "marketing" | "system" | null;
    image_url?: string | null;
    sender_id?: string | null;
    /** 동일 수신자·키 알림 중복 삽입 방지 — 마이그레이션 미적용 시 재시도에서 생략 */
    dedupe_key?: string | null;
    /** store_order_events.id — 알림·원장 1:1 (마이그레이션 미적용 시 재시도에서 생략) */
    store_order_event_id?: string | null;
  }
): Promise<boolean> {
  const uid = row.user_id.trim();
  if (!uid) return false;

  const actorId = extractActorUserIdFromNotificationRow(row);
  if (await shouldSuppressNotificationForBlock(uid, actorId)) {
    return false;
  }

  const metaMerged =
    row.meta && typeof row.meta === "object"
      ? {
          ...row.meta,
          ...(row.push_kind ? { push_kind: row.push_kind } : {}),
        }
      : row.push_kind
        ? { push_kind: row.push_kind }
        : row.meta ?? null;

  // P0 SSOT: legacy caller라도 notification_events 단일 경로로 수렴.
  const eventType = toNotificationEventType(row);
  const category = categoryForEventType(eventType);
  const dedupeKey = buildLegacyNotificationEventDedupeKey(row);
  try {
    const created = await createAndDispatchNotificationEvent(sb, {
      userId: uid,
      type: eventType,
      category,
      title: row.title,
      body: row.body ?? "",
      dedupeKey,
      actorUserId: actorId,
      displayPayload: {
        routeUrl: row.link_url ?? null,
        imageUrl: row.image_url ?? null,
        legacyNotificationType: row.notification_type,
        legacyPushKind: row.push_kind ?? null,
        legacyMeta: row.meta ?? null,
        legacyRefId: row.ref_id ?? null,
        legacyDomain: row.domain ?? null,
      },
      unread: true,
      appState: "background",
    });
    if (created.ok || created.duplicate) {
      // notification_events 전환 중에도 기존 허브/캐시 경로가 깨지지 않도록 최소 side-effect 유지.
      afterOwnerCommerceNotificationInserted(uid, metaMerged ?? undefined);
      void bumpNotificationTargetFromInboxRow(sb, {
        user_id: uid,
        notification_type: row.notification_type,
        ref_id: row.ref_id ?? null,
        meta: metaMerged,
      }).catch(() => {});
      return true;
    }
  } catch {
    // create/dispatch 예외는 legacy DB fallback 로 흡수한다.
    if (!LEGACY_NOTIFICATIONS_FALLBACK_ENABLED) return false;
  }

  if (!LEGACY_NOTIFICATIONS_FALLBACK_ENABLED) return false;

  /**
   * LEGACY DB FALLBACK:
   * 아래 블록은 `notification_events` 경로 실패 시에만 유지되는 구버전 `notifications` 삽입 경로다.
   * 신규 기능은 이 경로를 추가하지 말고, 위의 `createAndDispatchNotificationEvent` 만 사용한다.
   */
  const insert: Record<string, unknown> = {
    user_id: uid,
    notification_type: row.notification_type,
    title: row.title,
    body: row.body ?? null,
    link_url: row.link_url ?? null,
    is_read: false,
  };
  if (metaMerged != null) insert.meta = metaMerged;
  if (row.domain) insert.domain = row.domain;
  if (row.ref_id != null && String(row.ref_id).trim()) insert.ref_id = String(row.ref_id).trim();
  if (row.push_kind) insert.push_kind = row.push_kind;
  if (row.image_url != null && String(row.image_url).trim()) insert.image_url = String(row.image_url).trim();
  if (row.sender_id != null && String(row.sender_id).trim()) insert.sender_id = String(row.sender_id).trim();
  const dk = typeof row.dedupe_key === "string" ? row.dedupe_key.trim() : "";
  if (dk) insert.dedupe_key = dk;
  const evId = typeof row.store_order_event_id === "string" ? row.store_order_event_id.trim() : "";
  if (evId) insert.store_order_event_id = evId;

  let { error } = await sb.from("notifications").insert(insert);
  if (
    error &&
    (error.message?.includes("push_kind") ||
      error.message?.includes("image_url") ||
      error.message?.includes("sender_id"))
  ) {
    const fallbackInsert = { ...insert };
    delete fallbackInsert.push_kind;
    delete fallbackInsert.image_url;
    delete fallbackInsert.sender_id;
    const retry = await sb.from("notifications").insert(fallbackInsert);
    error = retry.error;
  }

  const pgCode = (error as { code?: string } | null)?.code;
  if (error && pgCode === "23505") {
    return true;
  }

  if (
    error &&
    (error.message?.includes("dedupe_key") ||
      error.message?.includes("store_order_event_id") ||
      error.message?.includes("notifications_user_store_order_event_uidx") ||
      error.message?.includes("notifications_user_dedupe_key_uidx"))
  ) {
    const fallbackDedupe = { ...insert };
    delete fallbackDedupe.dedupe_key;
    delete fallbackDedupe.store_order_event_id;
    const retryDedupe = await sb.from("notifications").insert(fallbackDedupe);
    const err2 = retryDedupe.error;
    const code2 = (err2 as { code?: string } | null)?.code;
    if (err2 && code2 === "23505") return true;
    if (!err2) {
      afterNotificationInsertedSuccess(sb, row, metaMerged as Record<string, unknown>);
      return true;
    }
    error = err2;
  }

  if (!error) {
    afterNotificationInsertedSuccess(sb, row, metaMerged as Record<string, unknown>);
    return true;
  }

  if (error.message?.includes("notifications") && error.message?.includes("does not exist")) {
    return false;
  }

  /* meta 컬럼 없음 → meta 없이 재시도 */
  if (error.message?.includes("meta") && metaMerged != null) {
    delete insert.meta;
    const { error: e2 } = await sb.from("notifications").insert(insert);
    if (e2 && (e2 as { code?: string }).code === "23505") return true;
    if (!e2) {
      afterNotificationInsertedSuccess(sb, row, metaMerged as Record<string, unknown>);
      return true;
    }
    if (e2.message?.includes("notifications") && e2.message?.includes("does not exist")) return false;
    console.error("[appendUserNotification] retry without meta", e2.message);
    return false;
  }

  /* commerce 타입 미적용 → system 으로 재시도 */
  if (
    row.notification_type === "commerce" &&
    (error.message?.includes("check constraint") || error.message?.includes("violates check"))
  ) {
    const sysRow: Record<string, unknown> = {
      user_id: uid,
      notification_type: "system",
      title: row.title,
      body: row.body ?? null,
      link_url: row.link_url ?? null,
      is_read: false,
    };
    if (dk) sysRow.dedupe_key = dk;
    if (evId) sysRow.store_order_event_id = evId;
    const { error: e3 } = await sb.from("notifications").insert(sysRow);
    if (e3 && (e3 as { code?: string }).code === "23505") return true;
    if (!e3) {
      afterNotificationInsertedSuccess(
        sb,
        { ...row, notification_type: "system" },
        metaMerged as Record<string, unknown>
      );
      return true;
    }
    if (e3.message?.includes("notifications") && e3.message?.includes("does not exist")) return false;
    console.error("[appendUserNotification] fallback system", e3.message);
    return false;
  }

  /* domain/ref_id 컬럼 미적용 스키마 → 제거 후 재시도 */
  if (
    (error.message?.includes("domain") || error.message?.includes("ref_id")) &&
    (insert.domain != null || insert.ref_id != null)
  ) {
    const fallback = { ...insert };
    delete fallback.domain;
    delete fallback.ref_id;
    const { error: e4 } = await sb.from("notifications").insert(fallback);
    if (e4 && (e4 as { code?: string }).code === "23505") return true;
    if (!e4) {
      afterNotificationInsertedSuccess(sb, row, metaMerged as Record<string, unknown>);
      return true;
    }
    if (e4.message?.includes("notifications") && e4.message?.includes("does not exist")) return false;
    console.error("[appendUserNotification] retry without domain", e4.message);
    return false;
  }

  console.error("[appendUserNotification]", error.message);
  return false;
}
