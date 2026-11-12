import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  moimClosedRetentionDue,
  moimJoinRequestsExpireDue,
  moimSanctionsExpireDue,
  moimScheduleRoomsArchiveDue,
  moimSchedulesClaimReminders,
  moimSchedulesFinishDue,
} from "@/lib/moim/server/moim-rpc.server";
import { filterMoimRecipientsByPref, moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 모임 일정 예약 작업 (10분마다, vercel.json) — 설계 §6 P10
 *  1) 끝난 일정 → done · 일정 채팅방 읽기 전용 · 확정 참여자에게 후기 안내
 *  2) 시작 24시간 전 · 1시간 전 리마인드 (일정마다 한 번, 모임 알림 설정 「일정」 켠 사람만)
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

  const finished = await moimSchedulesFinishDue(200, sb);
  let reviewSent = 0;
  if (finished.ok) {
    for (const s of finished.done ?? []) {
      await notifyMoimMany(sb, s.user_ids ?? [], {
        kind: "moim_schedule_review",
        moimId: s.moim_id,
        linkUrl: moimPaths.schedule(s.moim_id, s.schedule_id),
        dedupeRef: s.schedule_id,
        vars: { title: s.title },
      });
      reviewSent += (s.user_ids ?? []).length;
    }
  }

  const counts: Record<string, number> = {};
  for (const window of ["24h", "1h"] as const) {
    const claimed = await moimSchedulesClaimReminders(window, sb);
    counts[window] = 0;
    if (!claimed.ok) continue;
    for (const s of claimed.reminders ?? []) {
      const recipients = await filterMoimRecipientsByPref(sb, s.moim_id, s.user_ids ?? [], "schedules");
      await notifyMoimMany(sb, recipients, {
        kind: window === "24h" ? "moim_schedule_reminder_24h" : "moim_schedule_reminder_1h",
        moimId: s.moim_id,
        linkUrl: moimPaths.schedule(s.moim_id, s.schedule_id),
        dedupeRef: s.schedule_id,
        vars: { title: s.title },
      });
      counts[window] += recipients.length;
    }
  }

  let sanctionsRefreshed: number | null = null;
  try {
    const expired = await moimSanctionsExpireDue(200, sb);
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
  const joinRequestsExpired = await policyRun(() => moimJoinRequestsExpireDue(200, sb), "expired");
  const scheduleRoomsArchived = await policyRun(() => moimScheduleRoomsArchiveDue(200, sb), "archived");
  const closedRetentionEnded = await policyRun(() => moimClosedRetentionDue(100, sb), "ended");

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
