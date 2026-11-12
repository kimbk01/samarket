import "server-only";

import type { SupabaseServer } from "@/lib/chat/supabase-server";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MoimRole } from "@/lib/moim/moim-permission-contract";

/**
 * 모임 알림 (설계 docs/design/moim §7). 모든 함수는 실패해도 본 작업을 막지 않는다(best effort).
 * 중복 방지 키는 바뀐 행 id 기준(결정적) — `moim:{kind}:{ref}`.
 */

type MoimNotifyKind =
  | "moim_join_requested"
  | "moim_join_approved"
  | "moim_join_rejected"
  | "moim_member_removed"
  | "moim_invited"
  | "moim_role_changed"
  | "moim_host_transfer_requested"
  | "moim_host_changed"
  | "moim_notice_posted"
  | "moim_comment"
  | "moim_closed"
  | "moim_post_new"
  | "moim_schedule_created"
  | "moim_schedule_requested"
  | "moim_schedule_decided_ok"
  | "moim_schedule_decided_no"
  | "moim_schedule_reminder_24h"
  | "moim_schedule_reminder_1h"
  | "moim_schedule_cancelled"
  | "moim_schedule_review";

const ROLE_KEY: Record<MoimRole, MessageKey> = {
  host: "moim_role_host",
  co_host: "moim_role_co_host",
  staff: "moim_role_staff",
  member: "moim_role_member",
};

async function sendOne(
  sb: SupabaseServer,
  input: {
    userId: string;
    kind: MoimNotifyKind;
    moimId: string;
    linkUrl: string;
    dedupeRef: string;
    vars: Record<string, string>;
    roleVar?: MoimRole;
  }
): Promise<void> {
  try {
    const lang = await loadNotificationUserLanguage(sb, input.userId);
    const vars = { ...input.vars, ...(input.roleVar ? { role: notifySafeT(lang, ROLE_KEY[input.roleVar]) } : {}) };
    await appendUserNotification(sb, {
      user_id: input.userId,
      notification_type: "status",
      push_kind: "community",
      domain: "community_chat",
      ref_id: input.moimId,
      dedupe_key: `moim:${input.kind}:${input.dedupeRef}:${input.userId}`,
      title: notifySafeT(lang, `notify_${input.kind}_title` as MessageKey),
      body: notifySafeT(lang, `notify_${input.kind}_body` as MessageKey, { vars }),
      link_url: input.linkUrl,
      meta: { kind: input.kind, moim_id: input.moimId },
    });
  } catch (err) {
    console.warn("[moim-notify] failed", input.kind, err);
  }
}

export async function notifyMoimMany(
  sb: SupabaseServer,
  userIds: string[],
  input: Omit<Parameters<typeof sendOne>[1], "userId">
): Promise<void> {
  const uniq = [...new Set(userIds)].filter(Boolean);
  await Promise.all(uniq.map((userId) => sendOne(sb, { ...input, userId })));
}

/** 모임별 알림 설정으로 받는 사람 거르기 (행 없으면 기본값: 공지·일정 켜짐, 새 글 꺼짐 — 설계 §7 · D9) */
export async function filterMoimRecipientsByPref(
  sb: SupabaseServer,
  moimId: string,
  userIds: string[],
  pref: "notice" | "posts" | "schedules"
): Promise<string[]> {
  const uniq = [...new Set(userIds)].filter(Boolean);
  if (!uniq.length) return [];
  const { data } = await sb.from("moim_notification_prefs").select("user_id, notice, posts, schedules").eq("moim_id", moimId).in("user_id", uniq);
  const rows = new Map(((data ?? []) as { user_id: string; notice: boolean; posts: boolean; schedules: boolean }[]).map((r) => [r.user_id, r]));
  const fallback = { notice: true, posts: false, schedules: true };
  return uniq.filter((id) => (rows.get(id) ?? fallback)[pref]);
}

export const moimPaths = {
  home: (moimId: string) => `/moim/${moimId}`,
  post: (moimId: string, postId: string) => `/moim/${moimId}/posts/${postId}`,
  schedule: (moimId: string, scheduleId: string) => `/moim/${moimId}/schedules/${scheduleId}`,
  joinRequests: (moimId: string) => `/moim/${moimId}/manage/requests`,
  members: (moimId: string) => `/moim/${moimId}/manage/members`,
  invites: () => `/moim/invites`,
};
