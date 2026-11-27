import "server-only";

import type { SupabaseServer } from "@/lib/chat/supabase-server";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage, loadNotificationUserLanguages } from "@/lib/notifications/notification-user-language";
import { runWithConcurrencyLimit } from "@/lib/shared/run-with-concurrency-limit";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { keepAliveAfterResponse } from "@/lib/push/keep-alive-after-response";
import { listMoimActorsFor, loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { notificationCopyMeta } from "@/lib/notifications/notification-stored-copy";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MoimRole } from "@/lib/moim/moim-permission-contract";

/**
 * 모임 알림 (설계 docs/design/moim §7). 모든 함수는 실패해도 본 작업을 막지 않는다(best effort).
 * 중복 방지 키는 바뀐 행 id 기준(결정적) — `moim:{kind}:{ref}`.
 */

type MoimNotifyKind =
  | "moim_member_joined"
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
  | "moim_schedule_review"
  // M5 어드민 — 제재(필수 알림) · 어드민 정보 수정 · 미접속 모임장 변경 요청 결과
  | "moim_sanctioned"
  | "moim_admin_info_updated"
  | "moim_host_request_result"
  // M6 신고 처리 결과 — 신고자에게 조치 여부만 (상대에게 내린 조치 내용은 알리지 않음)
  | "moim_report_result";

/**
 * 설계 §7 「푸시 X」 = 알림함(벨)에만, 푸시·소리 없음 (2026-11-28 모임 3번 묶음 N1).
 * `moim_report_result` 는 커뮤니티 신고 결과 공용 분류라 여기서 바꾸지 않는다.
 */
const BELL_ONLY_KINDS: ReadonlySet<MoimNotifyKind> = new Set([
  "moim_member_joined",
  "moim_role_changed",
  "moim_host_changed",
  "moim_post_new",
]);

/** 여러 명 발송 동시 실행 상한 (E1) */
const MOIM_NOTIFY_CONCURRENCY = 8;

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
    /** 같은 종류 안의 문구 갈래 — 문구 키 `notify_{kind}_{variant}_title|body` (meta.kind 는 그대로) */
    variant?: string;
  },
  /** 미리 읽은 받는 사람 언어 (여러 명 발송 — E1). 없으면 이 사람만 읽는다 */
  preloadedLang?: AppLanguageCode
): Promise<void> {
  try {
    const lang = preloadedLang ?? (await loadNotificationUserLanguage(sb, input.userId));
    const vars = { ...input.vars, ...(input.roleVar ? { role: notifySafeT(lang, ROLE_KEY[input.roleVar]) } : {}) };
    const keyBase = input.variant ? `${input.kind}_${input.variant}` : input.kind;
    await appendUserNotification(sb, {
      user_id: input.userId,
      notification_type: "status",
      push_kind: "community",
      domain: "community_chat",
      ref_id: input.moimId,
      dedupe_key: `moim:${input.kind}:${input.dedupeRef}:${input.userId}`,
      title: notifySafeT(lang, `notify_${keyBase}_title` as MessageKey),
      body: notifySafeT(lang, `notify_${keyBase}_body` as MessageKey, { vars }),
      link_url: input.linkUrl,
      ...(BELL_ONLY_KINDS.has(input.kind) ? { bell_only: true } : {}),
      meta: {
        kind: input.kind,
        moim_id: input.moimId,
        ...notificationCopyMeta({
          titleKey: `notify_${keyBase}_title` as MessageKey,
          messageKey: `notify_${keyBase}_body` as MessageKey,
          vars: input.vars,
          varKeys: input.roleVar ? { role: ROLE_KEY[input.roleVar] } : undefined,
        }),
      },
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
  if (!uniq.length) return;
  /** E1: 언어는 한 번에(받는 사람마다 2회 → 전체 2회), 저장·푸시는 동시 최대 8개 */
  const langs = uniq.length > 1 ? await loadNotificationUserLanguages(sb, uniq).catch(() => null) : null;
  await runWithConcurrencyLimit(uniq, MOIM_NOTIFY_CONCURRENCY, (userId) => sendOne(sb, { ...input, userId }, langs?.get(userId)));
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

/**
 * 알림 발송을 응답 뒤로 (E1) — 발송은 지금 시작하고, 응답은 기다리지 않는다. 서버리스가 끝날 때까지 인스턴스를 유지한다.
 * 실패는 삼킨다(지금도 sendOne 이 실패를 삼키는 best effort).
 */
export function notifyMoimAfterResponse(work: () => Promise<unknown>): void {
  keepAliveAfterResponse(
    work().catch((err) => {
      console.warn("[moim-notify] after-response failed", err);
    })
  );
}

/** 가입 신청 → 승인권자(decide_join)에게 (설계 §7 moim_join_requested) — 가입 라우트·초대 수락 라우트 공용 (B3) */
export async function notifyMoimJoinRequested(sb: SupabaseServer, moimId: string, requestId: string, name: string): Promise<void> {
  const [deciders, moim] = await Promise.all([listMoimActorsFor(sb, moimId, "decide_join"), loadMoimName(sb, moimId)]);
  await notifyMoimMany(sb, deciders, {
    kind: "moim_join_requested",
    moimId,
    linkUrl: moimPaths.joinRequests(moimId),
    dedupeRef: requestId,
    vars: { moim, name },
  });
}

/** 새 멤버 → 모임장에게 벨만 (설계 §7 moim_member_joined · B2). 가입 1건 = 알림 1건(알림 저장소가 같은 키를 갱신하지 않음) */
export async function notifyMoimMemberJoined(sb: SupabaseServer, moimId: string, memberId: string, name: string): Promise<void> {
  const [{ data }, moim, member] = await Promise.all([
    sb.from("moims").select("host_user_id").eq("id", moimId).maybeSingle(),
    loadMoimName(sb, moimId),
    sb.from("moim_members").select("nickname, joined_at").eq("moim_id", moimId).eq("user_id", memberId).maybeSingle(),
  ]);
  const host = ((data as { host_user_id?: string | null } | null)?.host_user_id ?? "").trim();
  if (!host || host === memberId) return;
  const row = (member.data ?? null) as { nickname?: string; joined_at?: string | null } | null;
  const memberName = name.trim() || (row?.nickname ?? "").trim();
  await notifyMoimMany(sb, [host], {
    kind: "moim_member_joined",
    moimId,
    linkUrl: moimPaths.members(moimId),
    /** 모임·사람·가입 시각 — 다른 모임 가입·재가입도 각각 1건 (같은 키는 저장소가 버림 · 재감사 M1) */
    dedupeRef: `${moimId}:${memberId}:${row?.joined_at ?? ""}`,
    vars: { moim, name: memberName },
  });
}
