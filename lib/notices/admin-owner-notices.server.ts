/**
 * 어드민 「매장 공지」 목록 — 서버 전용 (설계 v3.2 §3-4 · Owner 2026-11-10).
 *
 * 조회만 한다(쓰기 없음). 규칙 정의는 `admin-owner-notices-model.ts`.
 * - 대상 사장님 = `collectOwnerAnnouncementRecipients` (알림 발송과 같은 함수 — 대상 수와 발송 대상이 같다).
 * - 읽음 = `customer_center_content_views` (사장님 상세 열람 POST 가 회원 공지와 같은 RPC 로 기록하는 표).
 * - 알림 결과 = `audit_logs` 의 `app_notice.notify_store_owners` (notify-owners API 가 남기는 감사 로그).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_NOTICES_CONTENT_SELECT } from "@/lib/notices/customer-center-content";
import {
  isOwnerAnnouncementAudience,
  type OwnerAnnouncementAudience,
} from "@/lib/notices/app-notice-audience";
import { collectOwnerAnnouncementRecipients } from "@/lib/notices/owner-announcements.server";
import {
  ADMIN_OWNER_NOTICES_LIST_MAX,
  adminOwnerNoticePublishState,
  countOwnerNoticeReaders,
  parseOwnerNoticeNotifyAudit,
  type AdminOwnerNoticeListRow,
  type AdminOwnerNoticeNotifyResult,
} from "@/lib/notices/admin-owner-notices-model";

export const OWNER_NOTICE_AUDIENCES: readonly OwnerAnnouncementAudience[] = ["store_owners", "store_owners_approved"];
export const OWNER_NOTICE_NOTIFY_AUDIT_ACTION = "app_notice.notify_store_owners" as const;

type NoticeRow = {
  id: string;
  title: string | null;
  audience: string | null;
  is_pinned: boolean | null;
  is_active: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  archived_at: string | null;
  published_at: string | null;
  created_at: string | null;
};

const VIEWS_PAGE = 1000;

/** 공지별 열람한 사용자 id 들 — 실패 시 null */
async function loadViewerIdsByNotice(
  sb: SupabaseClient,
  noticeIds: readonly string[]
): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>();
  if (noticeIds.length === 0) return out;
  for (let from = 0; from < 1_000_000; from += VIEWS_PAGE) {
    const { data, error } = await sb
      .from("customer_center_content_views")
      .select("content_id, user_id")
      .in("content_id", [...noticeIds])
      .order("content_id", { ascending: true })
      .order("user_id", { ascending: true })
      .order("view_day", { ascending: true })
      .range(from, from + VIEWS_PAGE - 1);
    if (error) return null;
    const chunk = (data ?? []) as { content_id: string; user_id: string }[];
    for (const r of chunk) {
      const k = String(r.content_id);
      const list = out.get(k);
      if (list) list.push(String(r.user_id));
      else out.set(k, [String(r.user_id)]);
    }
    if (chunk.length < VIEWS_PAGE) break;
  }
  return out;
}

/** 공지별 마지막 알림 발송 결과 — 실패 시 null */
async function loadLatestNotifyByNotice(
  sb: SupabaseClient,
  noticeIds: readonly string[]
): Promise<Map<string, AdminOwnerNoticeNotifyResult> | null> {
  const out = new Map<string, AdminOwnerNoticeNotifyResult>();
  if (noticeIds.length === 0) return out;
  const { data, error } = await sb
    .from("audit_logs")
    .select("target_id, after_json, created_at")
    .eq("target_type", "app_notice")
    .eq("action", OWNER_NOTICE_NOTIFY_AUDIT_ACTION)
    .in("target_id", [...noticeIds])
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) return null;
  for (const r of (data ?? []) as { target_id: string; after_json: unknown; created_at: string | null }[]) {
    const id = String(r.target_id);
    if (out.has(id)) continue; // 최신순 — 첫 행이 마지막 발송
    const parsed = parseOwnerNoticeNotifyAudit(r.after_json, r.created_at);
    if (parsed) out.set(id, parsed);
  }
  return out;
}

/** 대상별 사장님 id 집합 — 실패 시 null (대상 수·읽음 수 모두 「—」) */
async function loadTargetOwnerSets(
  sb: SupabaseClient,
  audiences: readonly OwnerAnnouncementAudience[]
): Promise<Map<OwnerAnnouncementAudience, Set<string>> | null> {
  try {
    const entries = await Promise.all(
      audiences.map(async (a) => {
        const recipients = await collectOwnerAnnouncementRecipients(sb, a);
        return [a, new Set(recipients.map((r) => r.ownerUserId))] as const;
      })
    );
    return new Map(entries);
  } catch {
    return null;
  }
}

export type AdminOwnerNoticeListResult =
  | { ok: true; rows: AdminOwnerNoticeListRow[]; truncated: boolean }
  | { ok: false; error: string };

export async function loadAdminOwnerNoticeList(
  sb: SupabaseClient,
  opts: { nowMs?: number } = {}
): Promise<AdminOwnerNoticeListResult> {
  const { data, error } = await sb
    .from("app_notices")
    .select(APP_NOTICES_CONTENT_SELECT)
    .in("audience", [...OWNER_NOTICE_AUDIENCES])
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(ADMIN_OWNER_NOTICES_LIST_MAX + 1);
  if (error) return { ok: false, error: error.message };

  const all = ((data ?? []) as unknown as NoticeRow[]).filter((r) => isOwnerAnnouncementAudience(r.audience));
  const truncated = all.length > ADMIN_OWNER_NOTICES_LIST_MAX;
  const notices = all.slice(0, ADMIN_OWNER_NOTICES_LIST_MAX);
  const ids = notices.map((n) => String(n.id));
  const usedAudiences = OWNER_NOTICE_AUDIENCES.filter((a) => notices.some((n) => n.audience === a));

  const [targets, viewers, notifies] = await Promise.all([
    loadTargetOwnerSets(sb, usedAudiences),
    loadViewerIdsByNotice(sb, ids),
    loadLatestNotifyByNotice(sb, ids),
  ]);

  const nowMs = opts.nowMs ?? Date.now();
  const rows: AdminOwnerNoticeListRow[] = notices.map((n) => {
    const id = String(n.id);
    const audience = n.audience as OwnerAnnouncementAudience;
    const targetSet = targets?.get(audience) ?? null;
    return {
      id,
      title: String(n.title ?? ""),
      audience,
      isPinned: n.is_pinned === true,
      publishState: adminOwnerNoticePublishState(n, nowMs),
      publishedAt: String(n.published_at ?? n.created_at ?? ""),
      startsAt: n.starts_at ?? null,
      endsAt: n.ends_at ?? null,
      targetCount: targetSet ? targetSet.size : null,
      readCount: targetSet && viewers ? countOwnerNoticeReaders(viewers.get(id) ?? [], targetSet) : null,
      notify: notifies?.get(id) ?? null,
      notifyUnknown: notifies == null,
    };
  });
  return { ok: true, rows, truncated };
}
