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
import { listBlockedEitherWayAmong } from "@/lib/community-messenger/social-relations";

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
  | "moim_report_result"
  // R2 N-04 어드민 조치 결과 (당사자 · 끌 수 없음)
  | "moim_unbanned"
  | "moim_content_moderated"
  | "moim_sanction_released"
  | "moim_restored";

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

export const MOIM_ROLE_KEY: Record<MoimRole, MessageKey> = {
  host: "moim_role_host",
  co_host: "moim_role_co_host",
  staff: "moim_role_staff",
  member: "moim_role_member",
};

type SendInput = {
  userId: string;
  kind: MoimNotifyKind;
  moimId: string;
  linkUrl: string;
  dedupeRef: string;
  vars: Record<string, string>;
  /** 치환값 중 문구 키인 것(역할·콘텐츠 종류·대체 이름) — 받는 사람 언어로 바꾸고 meta.varKeys 로 저장 (R2) */
  keyVars?: Record<string, MessageKey>;
  /** 받는 사람 언어로 만드는 치환값(리마인드 시각 — R2 U9-02) */
  varsForLang?: (lang: AppLanguageCode) => Record<string, string>;
  /** 같은 종류 안의 문구 갈래 — 문구 키 `notify_{kind}_{variant}_title|body` (meta.kind 는 그대로) */
  variant?: string;
  /** 사람이 한 활동 알림의 행위자 — 차단 관계면 보내지 않는다 (R2 N-08a · 결과·필수 알림에는 넣지 않음) */
  actorId?: string;
};

async function sendOne(
  sb: SupabaseServer,
  input: SendInput,
  /** 미리 읽은 받는 사람 언어 (여러 명 발송 — E1). 없으면 이 사람만 읽는다 */
  preloadedLang?: AppLanguageCode,
  /** 차단 일괄 확인을 못 했을 때만 — 저장소가 받는 사람마다 확인한다 */
  senderForBlockCheck?: string
): Promise<boolean> {
  try {
    const lang = preloadedLang ?? (await loadNotificationUserLanguage(sb, input.userId));
    const langVars = input.varsForLang ? input.varsForLang(lang) : {};
    const keyed: Record<string, string> = {};
    for (const [k, key] of Object.entries(input.keyVars ?? {})) keyed[k] = notifySafeT(lang, key);
    const vars = { ...input.vars, ...langVars, ...keyed };
    const keyBase = input.variant ? `${input.kind}_${input.variant}` : input.kind;
    return await appendUserNotification(sb, {
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
      ...(senderForBlockCheck ? { sender_id: senderForBlockCheck } : {}),
      meta: {
        kind: input.kind,
        moim_id: input.moimId,
        ...(input.actorId ? { actor_user_id: input.actorId } : {}),
        ...notificationCopyMeta({
          titleKey: `notify_${keyBase}_title` as MessageKey,
          messageKey: `notify_${keyBase}_body` as MessageKey,
          vars: { ...input.vars, ...langVars },
          varKeys: input.keyVars,
        }),
      },
    });
  } catch (err) {
    console.warn("[moim-notify] failed", input.kind, err);
    return false;
  }
}

/**
 * 여러 명 발송. 돌려주는 값 = 저장되지 않은 수(실패·차단으로 걸러짐 포함 — 리마인드·후기 크론은 행위자가 없어 실패만 센다).
 * 크론은 0 일 때만 「보냄」 표시를 한다(R2 재감사 F6).
 */
export async function notifyMoimMany(sb: SupabaseServer, userIds: string[], input: Omit<SendInput, "userId">): Promise<{ failed: number }> {
  let uniq = [...new Set(userIds)].filter((id) => Boolean(id) && id !== input.actorId);
  if (!uniq.length) return { failed: 0 };
  /**
   * R2 N-08a: 행위자와 차단 관계인 받는 사람은 한 번에 거른다(100명당 1회 조회). 조회가 실패하면 저장소가 사람마다 확인한다.
   * (저장소의 차단 확인은 `sender_id` 가 있을 때만 돈다 — 일괄로 걸렀으면 넣지 않아 받는 사람마다 다시 묻지 않는다)
   */
  let senderForBlockCheck: string | undefined;
  if (input.actorId) {
    const blocked = await listBlockedEitherWayAmong(input.actorId, uniq).catch(() => null);
    if (blocked) uniq = uniq.filter((id) => !blocked.has(id));
    else senderForBlockCheck = input.actorId;
    if (!uniq.length) return { failed: 0 };
  }
  /** E1: 언어는 50명 단위 2회(2×⌈N/50⌉ — W5 정정), 저장·푸시는 동시 최대 8개 */
  const langs = uniq.length > 1 ? await loadNotificationUserLanguages(sb, uniq).catch(() => null) : null;
  let failed = 0;
  await runWithConcurrencyLimit(uniq, MOIM_NOTIFY_CONCURRENCY, async (userId) => {
    if (!(await sendOne(sb, { ...input, userId }, langs?.get(userId), senderForBlockCheck))) failed += 1;
  });
  return { failed };
}

/** 리마인드 시각 (R2 U9-02 · 시안 「내일 오후 6시에」) — 필리핀 시간 기준, 받는 사람 언어로 */
export function moimNotifyStartParts(iso: string, now: Date = new Date()): { day: "today" | "tomorrow"; hour: number; minute: number } | null {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const part = (d: Date) => Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>;
  const a = part(t);
  const b = part(now);
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
  return { day: sameDay ? "today" : "tomorrow", hour: Number(a.hour), minute: Number(a.minute) };
}

export function formatMoimNotifyTime(lang: AppLanguageCode, hour: number, minute: number): string {
  const ampm = notifySafeT(lang, hour >= 12 ? "notify_moim_time_pm" : "notify_moim_time_am");
  const h = String(hour % 12 === 0 ? 12 : hour % 12);
  return minute
    ? notifySafeT(lang, "notify_moim_time_hm", { vars: { ampm, h, mm: String(minute).padStart(2, "0") } })
    : notifySafeT(lang, "notify_moim_time_h", { vars: { ampm, h } });
}

/**
 * 모임별 알림 설정으로 받는 사람 거르기 (행 없으면 기본값: 공지·일정 켜짐, 새 글 꺼짐 — 설계 §7 · D9).
 * R2 N-08b: 설정을 못 읽으면(1회 다시 시도 뒤) null — 끈 사람에게 가지 않게 보내지 않는다.
 */
export async function readMoimRecipientsByPref(
  sb: SupabaseServer,
  moimId: string,
  userIds: string[],
  pref: "notice" | "posts" | "schedules"
): Promise<string[] | null> {
  const uniq = [...new Set(userIds)].filter(Boolean);
  if (!uniq.length) return [];
  const read = () => sb.from("moim_notification_prefs").select("user_id, notice, posts, schedules").eq("moim_id", moimId).in("user_id", uniq);
  let res = await read();
  if (res.error) res = await read();
  if (res.error) {
    console.warn("[moim-notify] prefs read failed", moimId, pref);
    return null;
  }
  const rows = new Map(((res.data ?? []) as { user_id: string; notice: boolean; posts: boolean; schedules: boolean }[]).map((r) => [r.user_id, r]));
  const fallback = { notice: true, posts: false, schedules: true };
  return uniq.filter((id) => (rows.get(id) ?? fallback)[pref]);
}

/** 글·일정 발송용 — 설정을 못 읽으면 빈 목록(보내지 않음) */
export async function filterMoimRecipientsByPref(
  sb: SupabaseServer,
  moimId: string,
  userIds: string[],
  pref: "notice" | "posts" | "schedules"
): Promise<string[]> {
  return (await readMoimRecipientsByPref(sb, moimId, userIds, pref)) ?? [];
}

export const moimPaths = {
  /** 모임 탭 — 삭제된 모임 알림의 이동 위치 (D-24) */
  list: () => `/moim`,
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

/**
 * 가입 신청 → 승인권자(decide_join)에게 (설계 §7 moim_join_requested) — 가입 라우트·초대 수락 라우트 공용 (B3).
 * 이름 = DB 가 정한 닉네임(R2 N-08c). 그래도 비면 대체 이름 키.
 */
export async function notifyMoimJoinRequested(
  sb: SupabaseServer,
  moimId: string,
  requestId: string,
  name: string,
  applicantId: string
): Promise<void> {
  const [deciders, moim] = await Promise.all([listMoimActorsFor(sb, moimId, "decide_join"), loadMoimName(sb, moimId)]);
  const n = name.trim();
  await notifyMoimMany(sb, deciders, {
    kind: "moim_join_requested",
    moimId,
    linkUrl: moimPaths.joinRequests(moimId),
    dedupeRef: requestId,
    vars: { moim, ...(n ? { name: n } : {}) },
    ...(n ? {} : { keyVars: { name: "notify_member_fallback_name" as MessageKey } }),
    actorId: applicantId,
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
    vars: { moim, ...(memberName ? { name: memberName } : {}) },
    ...(memberName ? {} : { keyVars: { name: "notify_member_fallback_name" as MessageKey } }),
    actorId: memberId,
  });
}

type ClosedOrDeletedResult = {
  name?: string;
  notify_user_ids?: string[];
  cancelled_schedules?: { schedule_id: string; title: string; user_ids: string[] }[];
};

/**
 * 모임 종료(모임장)·어드민 삭제 알림 (R2 N-04·R-b) — 받는 사람은 DB 가 같은 트랜잭션에서 돌려준 값.
 *  - 멤버 전원: 종료 = `moim_closed`(모임 페이지 — 멤버는 보관 기간 열람) · 삭제 = 갈래 `admin_deleted`(모임 탭 — 모임 페이지는 404, D-24)
 *  - 함께 취소된 일정의 확정 참여자: `moim_schedule_cancelled`
 * 그 일을 한 사람(모임장)은 빼고 보낸다. 어드민 삭제는 사람 행위자가 없다(모임장도 받음).
 */
export async function notifyMoimClosedOrDeleted(
  sb: SupabaseServer,
  moimId: string,
  r: ClosedOrDeletedResult,
  opts: { kind: "closed" | "admin_deleted"; actorId?: string }
): Promise<void> {
  const moim = (r.name ?? "").trim() || (await loadMoimName(sb, moimId));
  const deleted = opts.kind === "admin_deleted";
  const notActor = (ids: string[] | undefined) => (ids ?? []).filter((id) => id !== opts.actorId);
  await notifyMoimMany(sb, notActor(r.notify_user_ids), {
    kind: "moim_closed",
    ...(deleted ? { variant: "admin_deleted" } : {}),
    moimId,
    linkUrl: deleted ? moimPaths.list() : moimPaths.home(moimId),
    dedupeRef: deleted ? `deleted:${moimId}:${Date.now()}` : moimId,
    vars: { moim },
  });
  for (const s of r.cancelled_schedules ?? []) {
    await notifyMoimMany(sb, notActor(s.user_ids), {
      kind: "moim_schedule_cancelled",
      moimId,
      linkUrl: deleted ? moimPaths.list() : moimPaths.schedule(moimId, s.schedule_id),
      dedupeRef: s.schedule_id,
      vars: { title: s.title },
    });
  }
}
