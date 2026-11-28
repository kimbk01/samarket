import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  moimCronTick,
  moimClosedRetentionDue,
  moimJoinRequestsExpireDue,
  moimSanctionsExpireDue,
  moimScheduleRoomsArchiveDue,
  moimSchedulesAckReminders,
  moimSchedulesAckReviews,
  moimSchedulesClaimReminders,
  moimSchedulesFinishDue,
  moimSchedulesReviewsPending,
} from "@/lib/moim/server/moim-rpc.server";
import {
  formatMoimNotifyTime,
  moimNotifyStartParts,
  moimPaths,
  notifyMoimMany,
  readMoimRecipientsByPref,
} from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 모임 일정 예약 작업 (10분마다, vercel.json) — 설계 §6 P10
 *  1) 끝난 일정 → done · 일정 채팅방 읽기 전용 · 확정 참여자(지금 활동 멤버)에게 후기 안내
 *  2) 시작 24시간 전 · 1시간 전 리마인드 (일정·시작 시각마다 한 번, 모임 알림 설정 「일정」 켠 사람만)
 *  R2 N-08e: 1·2 모두 **보낸 뒤에** 「보냄」 표시(ack). 중간에 끊기면 다음 회차에 다시 보내고, 이미 받은 사람 몫은
 *  같은 중복 키라 저장소가 버린다(푸시도 다시 가지 않음). 0건이면 ack 호출이 없다.
 *  3) 기간이 끝난 모임 제재 반영 (M5 · 설계 §6 P14 — 실패해도 1·2 결과는 그대로)
 *  4) 운영 정책 실행 (2026-11-12): 대기 가입 신청 만료 · 끝난 일정 방 보관 · 종료 모임 열람 기간 끝(방 보관).
 *     값은 어드민 「운영 정책」 — NULL 이면 하지 않음. 각각 실패해도 다른 결과는 그대로.
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  if (!verifyCronRequestAuthorization(req, secret)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const blocked = rejectCronIfSideEffectsBlocked();
  if (blocked) return blocked;
  const sb = getSupabaseServer();

  /**
   * 2026-11-19 예약 작업 2번 — DB 단계 7개를 함수 1번으로(같은 함수·인자). 알림 발송은 아래 그대로.
   * 함수가 없거나 오류면 null → 기존처럼 단계마다 부른다.
   */
  const tick = await moimCronTick(sb);
  if (!tick) console.warn("[cron moim-schedules] tick_fallback");

  /** 끝난 일정 처리(done·방 읽기 전용)만 — 후기 안내는 아래 「보낼 후기」 목록으로 (옛 반환 user_ids 는 쓰지 않음) */
  const finished = tick ? tick.finish : await moimSchedulesFinishDue(200, sb);
  let reviewSent = 0;
  const reviews = tick?.reviews ?? (await moimSchedulesReviewsPending(200, sb));
  if (reviews.ok) {
    const sentIds: string[] = [];
    for (const s of reviews.reviews ?? []) {
      const { failed } = await notifyMoimMany(sb, s.user_ids ?? [], {
        kind: "moim_schedule_review",
        moimId: s.moim_id,
        linkUrl: moimPaths.schedule(s.moim_id, s.schedule_id),
        dedupeRef: s.schedule_id,
        vars: { title: s.title },
      });
      reviewSent += (s.user_ids ?? []).length - failed;
      /** 저장에 실패한 사람이 있으면 표시하지 않는다 — 다음 회차에 다시(받은 사람 몫은 중복 키로 버려짐 · 재감사 F6) */
      if (failed === 0) sentIds.push(s.schedule_id);
    }
    if (sentIds.length) await moimSchedulesAckReviews(sentIds, sb).catch(() => null);
  }

  const counts: Record<string, number> = {};
  for (const window of ["24h", "1h"] as const) {
    const claimed = tick
      ? window === "24h"
        ? tick.reminders24h
        : tick.reminders1h
      : await moimSchedulesClaimReminders(window, sb);
    counts[window] = 0;
    if (!claimed.ok) continue;
    const sent: { schedule_id: string; starts_at: string }[] = [];
    for (const s of claimed.reminders ?? []) {
      const startsAt = s.starts_at ?? "";
      /** 설정을 못 읽으면 빈 목록 → 보내지도, 표시하지도 않는다(다음 회차에 다시 · R2 R-h) */
      const recipients = await readMoimRecipientsByPref(sb, s.moim_id, s.user_ids ?? [], "schedules");
      if (recipients === null) continue;
      const parts = startsAt ? moimNotifyStartParts(startsAt) : null;
      const { failed } = await notifyMoimMany(sb, recipients, {
        kind: window === "24h" ? "moim_schedule_reminder_24h" : "moim_schedule_reminder_1h",
        /** 시안 U9 「내일 오후 6시에 시작해요」 — 24시간 창은 오늘/내일 + 시각 (R2 U9-02 · N-07) */
        ...(window === "24h" && parts ? { variant: parts.day, varsForLang: (lang) => ({ time: formatMoimNotifyTime(lang, parts.hour, parts.minute) }) } : {}),
        moimId: s.moim_id,
        linkUrl: moimPaths.schedule(s.moim_id, s.schedule_id),
        /** R2 N-01: 시간을 바꾸면 새 시각 기준으로 다시 보낸다 */
        dedupeRef: `${s.schedule_id}:${startsAt}`,
        vars: { title: s.title },
      });
      counts[window] += recipients.length - failed;
      if (startsAt && failed === 0) sent.push({ schedule_id: s.schedule_id, starts_at: startsAt });
    }
    if (sent.length) await moimSchedulesAckReminders(window, sent, sb).catch(() => null);
  }

  let sanctionsRefreshed: number | null = null;
  try {
    const expired = tick ? tick.sanctions : await moimSanctionsExpireDue(200, sb);
    sanctionsRefreshed = expired.ok ? (expired.refreshed ?? []).length : null;
  } catch {
    sanctionsRefreshed = null;
  }

  const policyRun = async (fn: () => Promise<{ ok: boolean } & Record<string, unknown>>, key: string): Promise<number | null> => {
    try {
      const r = await fn();
      return r.ok && typeof r[key] === "number" ? (r[key] as number) : null;
    } catch {
      return null;
    }
  };
  const joinRequestsExpired = await policyRun(
    () => (tick ? Promise.resolve(tick.joinRequests) : moimJoinRequestsExpireDue(200, sb)),
    "expired"
  );
  const scheduleRoomsArchived = await policyRun(
    () => (tick ? Promise.resolve(tick.scheduleRooms) : moimScheduleRoomsArchiveDue(200, sb)),
    "archived"
  );
  const closedRetentionEnded = await policyRun(
    () => (tick ? Promise.resolve(tick.closedRetention) : moimClosedRetentionDue(100, sb)),
    "ended"
  );

  return NextResponse.json({
    ok: true,
    sanctionsRefreshed,
    joinRequestsExpired,
    scheduleRoomsArchived,
    closedRetentionEnded,
    finished: finished.ok ? (finished.done ?? []).length : null,
    reviewSent,
    reminders24h: counts["24h"],
    reminders1h: counts["1h"],
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
