import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { commerceMetaKindLabel } from "@/lib/notifications/notification-display-labels";
import {
  buildInboxDisplayTitle,
  resolveInboxSurfaceBadge,
} from "@/lib/notifications/notification-inbox-surface-label";
import {
  defaultInboxFallbackHref,
  resolveNotificationInboxHref,
} from "@/lib/notifications/resolve-notification-inbox-href";

export type InboxRowInput = {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
  meta?: Record<string, unknown> | null;
  domain?: string | null;
};

export type InboxGroupItem = {
  key: string;
  ids: string[];
  /** 같은 채팅방/스레드로 합쳐진 그룹이면 true (채팅만) */
  isThread: boolean;
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

/**
 * `chat` 은 `link_url` 의 방 id 기준으로 묶는다. 매칭되지 않으면 건별(id) 유지.
 */
export function groupKeyForInboxRow(r: InboxRowInput): string {
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

/**
 * 최신순 — 목록/드롭다운 공통. 채팅은 방 단위 1행, 그 외는 1알림 1행.
 */
export function buildInboxGroupItems(
  rows: InboxRowInput[],
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
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
    const rawHref = resolveNotificationInboxHref(latest) ?? latest.link_url?.trim() ?? null;
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
      },
      language
    );
    const kindLabel = knd && knd !== surfaceBadge ? knd : null;
    const displayTitle = buildInboxDisplayTitle(latest.title, fromLabel, latest.notification_type);
    out.push({
      key: `${key}:${ids[0]}`,
      ids,
      isThread,
      notification_type: latest.notification_type,
      title: latest.title,
      displayTitle,
      body: latest.body,
      href,
      created_at: latest.created_at,
      unreadCount,
      meta: metaObj,
      kindLabel,
      surfaceBadge,
    });
  }
  return out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
