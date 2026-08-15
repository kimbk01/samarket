import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { commerceMetaKindLabel } from "@/lib/notifications/notification-display-labels";
import {
  resolveInboxOrderStatusChip,
} from "@/lib/notifications/inbox-order-status-label";
import {
  buildInboxDisplayTitle,
  resolveInboxSurfaceBadge,
} from "@/lib/notifications/notification-inbox-surface-label";
import {
  resolveNotificationInboxBody,
  resolveNotificationInboxTitle,
} from "@/lib/notifications/resolve-commerce-notification-inbox-text";
import {
  defaultInboxFallbackHref,
} from "@/lib/notifications/resolve-notification-inbox-href";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import { buildTradeTargetId } from "@/lib/notifications/badge-target-policy";
import type { InboxPushKindFilter } from "@/lib/me/fetch-me-notifications-deduped";
import type { BellPresentationType } from "@/lib/notifications/inbox-events-merge";

export type InboxRowInput = {
  id: string;
  source?: "legacy" | "event";
  notification_type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
  meta?: Record<string, unknown> | null;
  domain?: string | null;
  push_kind?: string | null;
  bell_presentation_type?: BellPresentationType | null;
  event_type?: string | null;
  campaign_type?: string | null;
};

export type InboxGroupItem = {
  key: string;
  /** Latest notification event id in this presentation group. */
  notification_id: string;
  ids: string[];
  /** 같은 채팅방/스레드로 합쳐진 그룹 */
  isThread: boolean;
  /** commerce 주문번호 단위 그룹 */
  isOrderGroup: boolean;
  notification_type: string;
  title: string;
  /** 발신자·제목 요약 (채팅 sender_label 반영) */
  displayTitle: string;
  body: string | null;
  href: string;
  created_at: string;
  unreadCount: number;
  meta: Record<string, unknown> | null;
  kindLabel: string | null;
  /** 상단 채널/도메인 요약 뱃지 */
  surfaceBadge: string;
  /** stable sort — groupKeyForInboxRow prefix */
  groupSortKey: string;
  push_kind?: string | null;
  bell_presentation_type?: BellPresentationType | null;
  event_type?: string | null;
  campaign_type?: string | null;
};

function toPathname(u: string): string {
  const t = u.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      return new URL(t).pathname;
    } catch {
      return t.split("?")[0] ?? t;
    }
  }
  return t.split("?")[0] ?? t;
}

function orderIdFromInboxRow(r: InboxRowInput): string | null {
  const meta = r.meta as { order_id?: unknown } | null | undefined;
  const fromMeta = typeof meta?.order_id === "string" ? meta.order_id.trim() : "";
  if (fromMeta) return fromMeta;
  return null;
}

function postIdFromInboxRow(r: InboxRowInput): string | null {
  const meta = r.meta as { post_id?: unknown; community_post_id?: unknown } | null | undefined;
  const fromPost = typeof meta?.post_id === "string" ? meta.post_id.trim() : "";
  if (fromPost) return fromPost;
  const fromCommunity = typeof meta?.community_post_id === "string" ? meta.community_post_id.trim() : "";
  return fromCommunity || null;
}

/**
 * `chat` — 방 id · `commerce`+주문 id — 주문 단위 · trade/post — 대상 1행.
 */
export function groupKeyForInboxRow(r: InboxRowInput): string {
  if (r.notification_type === "commerce") {
    const oid = orderIdFromInboxRow(r);
    if (oid) return `order:${oid}`;
  }

  if (r.notification_type === "status") {
    const meta = r.meta as { kind?: unknown; product_id?: unknown; seller_id?: unknown; buyer_id?: unknown } | null;
    const kind = typeof meta?.kind === "string" ? meta.kind.trim() : "";
    if (kind === "trade_offer") {
      const productId = typeof meta?.product_id === "string" ? meta.product_id.trim() : "";
      const sellerId = typeof meta?.seller_id === "string" ? meta.seller_id.trim() : "";
      const buyerId = typeof meta?.buyer_id === "string" ? meta.buyer_id.trim() : "";
      if (productId && sellerId && buyerId) {
        return `trade:${buildTradeTargetId(productId, sellerId, buyerId)}`;
      }
    }
  }

  const postId = postIdFromInboxRow(r);
  if (postId && (r.notification_type === "review" || r.domain === "community" || r.notification_type === "system")) {
    return `post:${postId}`;
  }

  if (r.notification_type !== "chat") {
    return `one:${r.id}`;
  }
  const u = r.link_url?.trim() ?? "";
  if (!u) {
    return `one:${r.id}`;
  }
  const path = toPathname(u);
  const m1 = path.match(/\/community-messenger\/rooms\/([^/?#]+)/);
  if (m1?.[1]) {
    return `cm:${decodeURIComponent(m1[1])}`;
  }
  const m2 = path.match(/\/chats\/([^/?#]+)/);
  if (m2?.[1]) {
    return `ch:${decodeURIComponent(m2[1])}`;
  }
  const m3 = path.match(/\/mypage\/trade\/chat\/([^/?#]+)/);
  if (m3?.[1]) {
    return `mp:${decodeURIComponent(m3[1])}`;
  }
  return `one:${r.id}`;
}

function rowMatchesSurfacePriority(row: InboxRowInput, priorityPushKind: InboxPushKindFilter | null): boolean {
  if (!priorityPushKind || priorityPushKind === "all") return true;
  const pk = String(row.push_kind ?? "").trim().toLowerCase();
  const domain = String(row.domain ?? "").trim().toLowerCase();
  switch (priorityPushKind) {
    case "chat":
      return row.notification_type === "chat" || pk === "chat" || domain.includes("chat");
    case "trade":
      return pk === "trade" || domain === "trade_chat" || row.notification_type === "status";
    case "delivery":
      return pk === "delivery" || domain === "order" || row.notification_type === "commerce";
    case "community":
      return pk === "community" || domain === "community" || Boolean(postIdFromInboxRow(row));
    default:
      return true;
  }
}

/**
 * 최신순 — 목록/드롭다운 공통. surface priorityPushKind 가 있으면 해당 domain을 상단(stable).
 */
export function buildInboxGroupItems(
  rows: InboxRowInput[],
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE,
  priorityPushKind?: InboxPushKindFilter | null
): InboxGroupItem[] {
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const map = new Map<string, InboxRowInput[]>();
  for (const r of sorted) {
    const k = groupKeyForInboxRow(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const out: InboxGroupItem[] = [];
  for (const [key, list] of map) {
    const g = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const latest = g[0]!;
    const ids = g.map((x) => x.id);
    const unreadCount = g.filter((x) => !x.is_read).length;
    const isThread = latest.notification_type === "chat" && (g.length > 1 || /^(cm|ch|mp):/.test(key));
    const isOrderGroup = latest.notification_type === "commerce" && key.startsWith("order:");
    const rawHref =
      resolveNotificationDestination({
        inboxRow: {
          id: latest.id,
          notification_type: latest.notification_type,
          link_url: latest.link_url,
          meta: latest.meta ?? null,
          push_kind: latest.push_kind ?? null,
          bell_presentation_type: latest.bell_presentation_type ?? null,
          event_type: latest.event_type ?? null,
          campaign_type: latest.campaign_type ?? null,
        },
        fallbackHref: defaultInboxFallbackHref(),
      }).href ||
      latest.link_url?.trim() ||
      null;
    const href = rawHref && rawHref.length > 0 ? rawHref : defaultInboxFallbackHref();
    const knd =
      latest.notification_type === "commerce"
        ? commerceMetaKindLabel((latest.meta as { kind?: string } | null)?.kind, language)
        : null;
    const metaObj = latest.meta ?? null;
    const senderRaw = metaObj && typeof (metaObj as { sender_label?: unknown }).sender_label === "string"
      ? String((metaObj as { sender_label: string }).sender_label).trim()
      : "";
    const fromLabel = senderRaw.length > 0 ? senderRaw : null;
    const surfaceBadge = resolveInboxSurfaceBadge(
      {
        notification_type: latest.notification_type,
        domain: latest.domain,
        meta: metaObj,
        link_url: latest.link_url,
        bell_presentation_type: latest.bell_presentation_type,
      },
      language
    );
    const kindLabel = isOrderGroup
      ? resolveInboxOrderStatusChip((metaObj as { order_status?: unknown } | null)?.order_status, language) ??
        (knd && knd !== surfaceBadge ? knd : null)
      : knd && knd !== surfaceBadge
        ? knd
        : null;
    const safeTitle = resolveNotificationInboxTitle(language, {
      notification_type: latest.notification_type,
      title: latest.title,
      body: latest.body,
      meta: metaObj,
    });
    const displayTitle = buildInboxDisplayTitle(safeTitle, fromLabel, latest.notification_type);
    const safeBody = resolveNotificationInboxBody(language, {
      notification_type: latest.notification_type,
      body: latest.body,
      meta: metaObj,
    });
    out.push({
      key: `${key}:${ids[0]}`,
      notification_id: latest.id,
      ids,
      isThread,
      isOrderGroup,
      notification_type: latest.notification_type,
      title: safeTitle,
      displayTitle,
      body: safeBody,
      href,
      created_at: latest.created_at,
      unreadCount,
      meta: metaObj,
      kindLabel,
      surfaceBadge,
      groupSortKey: key,
      push_kind: latest.push_kind ?? null,
      bell_presentation_type: latest.bell_presentation_type ?? null,
      event_type: latest.event_type ?? null,
      campaign_type: latest.campaign_type ?? null,
    });
  }
  const pk = priorityPushKind && priorityPushKind !== "all" ? priorityPushKind : null;
  const priorityByGroup = new Map<string, boolean>();
  for (const [key, list] of map) {
    const latest = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]!;
    priorityByGroup.set(key, pk ? rowMatchesSurfacePriority(latest, pk) : true);
  }
  return out.sort((a, b) => {
    if (pk) {
      const aPri = priorityByGroup.get(a.groupSortKey) ?? false;
      const bPri = priorityByGroup.get(b.groupSortKey) ?? false;
      if (aPri !== bPri) return aPri ? -1 : 1;
    }
    return a.created_at < b.created_at ? 1 : -1;
  });
}
