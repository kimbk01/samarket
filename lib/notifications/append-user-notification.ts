import type { SupabaseClient } from "@supabase/supabase-js";
import { publishNotificationSideEffect } from "@/lib/notifications/publish-notification-side-effect";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { invalidateNotificationUnreadCountCache } from "@/lib/notifications/notification-unread-count-cache";

export type AppNotificationType =
  | "chat"
  | "status"
  | "review"
  | "report"
  | "system"
  | "commerce";

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
  }
): Promise<boolean> {
  const uid = row.user_id.trim();
  if (!uid) return false;

  const metaMerged =
    row.meta && typeof row.meta === "object"
      ? {
          ...row.meta,
          ...(row.push_kind ? { push_kind: row.push_kind } : {}),
        }
      : row.push_kind
        ? { push_kind: row.push_kind }
        : row.meta ?? null;

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
  if (!error) {
    invalidateNotificationUnreadCountCache(uid);
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
    return true;
  }

  if (error.message?.includes("notifications") && error.message?.includes("does not exist")) {
    return false;
  }

  /* meta 컬럼 없음 → meta 없이 재시도 */
  if (error.message?.includes("meta") && metaMerged != null) {
    delete insert.meta;
    const { error: e2 } = await sb.from("notifications").insert(insert);
    if (!e2) {
      invalidateNotificationUnreadCountCache(uid);
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
    const { error: e3 } = await sb.from("notifications").insert({
      user_id: uid,
      notification_type: "system",
      title: row.title,
      body: row.body ?? null,
      link_url: row.link_url ?? null,
      is_read: false,
    });
    if (!e3) {
      invalidateNotificationUnreadCountCache(uid);
      void publishNotificationSideEffect(
        {
          user_id: uid,
          notification_type: "system",
          title: row.title,
          body: row.body ?? null,
          link_url: row.link_url ?? null,
          meta: metaMerged,
        },
        sb
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
    if (!e4) {
      invalidateNotificationUnreadCountCache(uid);
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
      return true;
    }
    if (e4.message?.includes("notifications") && e4.message?.includes("does not exist")) return false;
    console.error("[appendUserNotification] retry without domain", e4.message);
    return false;
  }

  console.error("[appendUserNotification]", error.message);
  return false;
}
