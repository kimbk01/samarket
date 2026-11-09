/**
 * 매장 사장님 전용 운영 공지 (배달 오픈 4단계 · Owner 승인 설계 2026-11-10) — 서버 전용.
 *
 * 원장 = `app_notices` (audience ≠ all) · 열람 기록 = `customer_center_content_views` (회원 공지와 같은 표·같은 RPC).
 * 게시 기간·게시 상태 = 회원 공지와 같은 판정(`isCustomerCenterContentPublishedNow`).
 * 볼 수 있는 사람 = `stores.owner_user_id` 가 본인인 매장 보유자 (`ownerAnnouncementAudiencesForStores`).
 * 알림 = 기존 관리자 → 사장님 운영 알림과 같은 경로(`appendUserNotification` · kind `admin_store_operational_notice`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APP_NOTICES_CONTENT_SELECT,
  isCustomerCenterContentPublishedNow,
  parseCustomerCenterContentType,
  resolveCustomerCenterAuthorLabel,
  type CustomerCenterContentRow,
} from "@/lib/notices/customer-center-content";
import {
  buildOwnerAnnouncementDetailPath,
  isOwnerAnnouncementAudience,
  ownerAnnouncementAudiencesForStores,
  type OwnerAnnouncementAudience,
} from "@/lib/notices/app-notice-audience";
import { normalizeCustomerCenterHeroImageUrl } from "@/lib/notices/customer-center-media";
import { isCustomerCenterContentNew, loadMemberReadContentIds } from "@/lib/notices/customer-center-read-state";
import { ownerStoreOperationalWriteBlock } from "@/lib/stores/owner-product-gate";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { patchInboxNotificationIdsRead } from "@/lib/notifications/inbox-read-bridge";

/** 목록 최대 건수 — 운영 공지는 수십 건 규모라 페이지 없이 한 번에 */
export const OWNER_ANNOUNCEMENTS_LIST_MAX = 50;

/** 알림 메타 kind — 기존 관리자 → 사장님 운영 알림 kind (사장님 알림함·관리자 「매장 알림」 결과에 함께 잡힘) */
export const OWNER_ANNOUNCEMENT_NOTIFICATION_META_KIND = "admin_store_operational_notice" as const;
export const OWNER_ANNOUNCEMENT_NOTIFICATION_SOURCE = "admin_owner_announcement" as const;

export function ownerAnnouncementNotificationDedupeKey(noticeId: string, ownerUserId: string): string {
  return `admin:owner_announcement:${noticeId.trim()}:${ownerUserId.trim()}`;
}

export type OwnerAnnouncementAccess =
  | { ok: true; audiences: OwnerAnnouncementAudience[]; storeIds: string[] }
  | { ok: false; error: "not_store_owner" | "stores_lookup_failed" };

/** 로그인 사용자 → 볼 수 있는 사장님 공지 대상. 매장이 없으면 `not_store_owner`. */
export async function loadOwnerAnnouncementAccess(
  sb: SupabaseClient,
  userId: string
): Promise<OwnerAnnouncementAccess> {
  const { data, error } = await sb
    .from("stores")
    .select("id, approval_status")
    .eq("owner_user_id", userId)
    .limit(100);
  if (error) return { ok: false, error: "stores_lookup_failed" };
  const rows = (data ?? []) as { id: string; approval_status: string | null }[];
  const audiences = ownerAnnouncementAudiencesForStores(rows.map((r) => r.approval_status));
  if (audiences.length === 0) return { ok: false, error: "not_store_owner" };
  return { ok: true, audiences, storeIds: rows.map((r) => String(r.id)) };
}

export type OwnerAnnouncementListItem = {
  id: string;
  title: string;
  isPinned: boolean;
  audience: OwnerAnnouncementAudience;
  createdAt: string;
  read: boolean;
  isNew: boolean;
};

type ContentRow = CustomerCenterContentRow & { audience?: string | null; is_pinned?: boolean | null };

function publishedAtOf(row: { published_at?: string | null; created_at?: string | null }): string {
  return String(row.published_at ?? row.created_at ?? "");
}

/** 고정 먼저 · 게시일 최신순 · id (DB 정렬과 같은 규칙 — 게시 기간 필터 뒤 재확인용) */
export function compareOwnerAnnouncements(
  a: { is_pinned?: boolean | null; published_at?: string | null; created_at?: string | null; id: string },
  b: { is_pinned?: boolean | null; published_at?: string | null; created_at?: string | null; id: string },
  opts?: { latestOnly?: boolean }
): number {
  if (!opts?.latestOnly) {
    const pa = a.is_pinned === true ? 1 : 0;
    const pb = b.is_pinned === true ? 1 : 0;
    if (pa !== pb) return pb - pa;
  }
  const ta = Date.parse(publishedAtOf(a)) || 0;
  const tb = Date.parse(publishedAtOf(b)) || 0;
  if (ta !== tb) return tb - ta;
  return String(b.id).localeCompare(String(a.id));
}

/**
 * 목록 — `latestOnly` 면 고정 무시하고 게시일 최신순(허브 「최신 공지 1건」 카드).
 */
export async function listOwnerAnnouncements(
  sb: SupabaseClient,
  userId: string,
  audiences: readonly OwnerAnnouncementAudience[],
  opts: { limit: number; latestOnly?: boolean }
): Promise<OwnerAnnouncementListItem[]> {
  if (audiences.length === 0) return [];
  const limit = Math.max(1, Math.min(OWNER_ANNOUNCEMENTS_LIST_MAX, Math.floor(opts.limit)));
  const { data, error } = await sb
    .from("app_notices")
    .select(APP_NOTICES_CONTENT_SELECT)
    .in("audience", [...audiences])
    .eq("is_active", true)
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    // 게시 기간 밖 행을 걸러도 한 화면이 차도록 넉넉히 읽는다
    .limit(OWNER_ANNOUNCEMENTS_LIST_MAX * 2);
  if (error) throw new Error(`owner_announcements_load_failed: ${error.message}`);
  const live = ((data ?? []) as unknown as ContentRow[])
    .filter((r) => isOwnerAnnouncementAudience(r.audience) && isCustomerCenterContentPublishedNow(r))
    .sort((a, b) => compareOwnerAnnouncements(a, b, { latestOnly: opts.latestOnly }))
    .slice(0, limit);
  const readIds = await loadMemberReadContentIds(
    sb,
    userId,
    live.map((r) => String(r.id))
  );
  return live.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    isPinned: r.is_pinned === true,
    audience: r.audience as OwnerAnnouncementAudience,
    createdAt: publishedAtOf(r),
    read: readIds.has(String(r.id)),
    isNew: isCustomerCenterContentNew(publishedAtOf(r)),
  }));
}

export type OwnerAnnouncementDetail =
  | { kind: "not_found" }
  | { kind: "unavailable"; id: string; title: string }
  | {
      kind: "ok";
      notice: {
        id: string;
        title: string;
        body: string;
        heroImageUrl: string | null;
        authorLabel: string;
        isPinned: boolean;
        createdAt: string;
        read: boolean;
      };
    };

/** 상세 — 대상이 아니면 없는 글(not_found), 게시 종료면 unavailable(알림 기록에서 들어온 경우). */
export async function loadOwnerAnnouncementDetail(
  sb: SupabaseClient,
  userId: string,
  audiences: readonly OwnerAnnouncementAudience[],
  noticeId: string
): Promise<OwnerAnnouncementDetail> {
  const { data, error } = await sb
    .from("app_notices")
    .select(APP_NOTICES_CONTENT_SELECT)
    .eq("id", noticeId)
    .maybeSingle();
  if (error) throw new Error(`owner_announcement_load_failed: ${error.message}`);
  const row = (data ?? null) as unknown as ContentRow | null;
  if (!row || !isOwnerAnnouncementAudience(row.audience) || !audiences.includes(row.audience)) {
    return { kind: "not_found" };
  }
  const id = String(row.id);
  if (!isCustomerCenterContentPublishedNow(row)) {
    return { kind: "unavailable", id, title: String(row.title ?? "") };
  }
  const readIds = await loadMemberReadContentIds(sb, userId, [id]);
  const contentType = parseCustomerCenterContentType(row.content_type, "notice");
  return {
    kind: "ok",
    notice: {
      id,
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      heroImageUrl: normalizeCustomerCenterHeroImageUrl(row.hero_image_url),
      authorLabel: resolveCustomerCenterAuthorLabel({ contentType, authorLabel: row.author_label }),
      isPinned: row.is_pinned === true,
      createdAt: publishedAtOf(row),
      read: readIds.has(id),
    },
  };
}

/**
 * 이 공지를 가리키는 내 미읽음 알림 → 읽음 (글을 읽으면 알림도 읽음 — 회원 공지 §5 와 같은 규칙).
 * 운영 알림은 `display_payload.legacyMeta.owner_announcement_id` 로 공지를 가리킨다.
 */
export async function markOwnerAnnouncementNotificationsRead(
  sb: SupabaseClient,
  userId: string,
  noticeId: string
): Promise<number> {
  const { data, error } = await sb
    .from("notification_events")
    .select("id")
    .eq("user_id", userId)
    .eq("unread", true)
    .is("read_at", null)
    .eq("display_payload->legacyMeta->>owner_announcement_id", noticeId)
    .limit(50);
  if (error || !data || data.length === 0) return 0;
  const res = await patchInboxNotificationIdsRead(
    sb,
    userId,
    (data as { id: string }[]).map((r) => String(r.id))
  );
  return res.ok ? res.updated : 0;
}

export type OwnerAnnouncementRecipient = { ownerUserId: string; storeId: string };

/**
 * 알림 받을 사장님 — 대상 규칙은 조회와 같다(`store_owners` = 매장 행만 있으면, `_approved` = 승인 매장 보유).
 * 사장님 1명 = 알림 1건. 알림함은 매장 단위라 대표 매장 1곳(승인 매장 우선 → 먼저 만든 매장)으로 보낸다.
 */
export async function collectOwnerAnnouncementRecipients(
  sb: SupabaseClient,
  audience: OwnerAnnouncementAudience
): Promise<OwnerAnnouncementRecipient[]> {
  type StoreRow = { id: string; owner_user_id: string | null; approval_status: string | null; created_at: string | null };
  const rows: StoreRow[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data, error } = await sb
      .from("stores")
      .select("id, owner_user_id, approval_status, created_at")
      .not("owner_user_id", "is", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`owner_announcement_recipients_failed: ${error.message}`);
    const chunk = (data ?? []) as StoreRow[];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  const byOwner = new Map<string, { storeId: string; approved: boolean }>();
  for (const r of rows) {
    const owner = String(r.owner_user_id ?? "").trim();
    if (!owner) continue;
    const approved = ownerStoreOperationalWriteBlock(r.approval_status) === null;
    if (audience === "store_owners_approved" && !approved) continue;
    const prev = byOwner.get(owner);
    // 먼저 만든 매장이 앞에 온다 — 승인 매장이 나오면 그것으로 바꾼다(한 번만)
    if (!prev || (!prev.approved && approved)) byOwner.set(owner, { storeId: String(r.id), approved });
  }
  return [...byOwner.entries()].map(([ownerUserId, v]) => ({ ownerUserId, storeId: v.storeId }));
}

/** 알림 본문 — 마크다운 기호를 덜어낸 앞부분 */
export function ownerAnnouncementNotificationBody(markdown: string, max = 140): string {
  const plain = String(markdown ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

export type OwnerAnnouncementNotifyResult = {
  recipients: number;
  sent: number;
  failed: number;
};

/**
 * 사장님마다 알림 1건 — 중복 방지 키 = 공지 id + 사장님 id (다시 눌러도 같은 사장님에게 두 번 가지 않음).
 * 이미 보낸 키는 `appendUserNotification` 이 중복으로 보고 true 를 돌려준다(성공으로 셈).
 */
export async function sendOwnerAnnouncementNotifications(
  sb: SupabaseClient,
  input: {
    noticeId: string;
    title: string;
    body: string;
    audience: OwnerAnnouncementAudience;
    adminActorId: string;
  },
  deps: {
    collect?: typeof collectOwnerAnnouncementRecipients;
    append?: typeof appendUserNotification;
    concurrency?: number;
  } = {}
): Promise<OwnerAnnouncementNotifyResult> {
  const collect = deps.collect ?? collectOwnerAnnouncementRecipients;
  const append = deps.append ?? appendUserNotification;
  const recipients = await collect(sb, input.audience);
  const title = input.title.trim().slice(0, 120);
  const body = ownerAnnouncementNotificationBody(input.body);
  let sent = 0;
  let failed = 0;
  const concurrency = Math.max(1, deps.concurrency ?? 5);
  for (let i = 0; i < recipients.length; i += concurrency) {
    const batch = recipients.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((r) =>
        append(sb, {
          user_id: r.ownerUserId,
          notification_type: "system",
          domain: "store",
          ref_id: r.storeId,
          push_kind: "notice",
          dedupe_key: ownerAnnouncementNotificationDedupeKey(input.noticeId, r.ownerUserId),
          title,
          body,
          link_url: buildOwnerAnnouncementDetailPath(input.noticeId, r.storeId),
          meta: {
            kind: OWNER_ANNOUNCEMENT_NOTIFICATION_META_KIND,
            store_id: r.storeId,
            source: OWNER_ANNOUNCEMENT_NOTIFICATION_SOURCE,
            owner_announcement_id: input.noticeId,
            admin_actor_id: input.adminActorId,
          },
        }).catch(() => false)
      )
    );
    for (const ok of results) {
      if (ok) sent += 1;
      else failed += 1;
    }
  }
  return { recipients: recipients.length, sent, failed };
}
