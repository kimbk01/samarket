import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { computeNextRecurrenceScheduledFor } from "@/lib/admin/notification-campaigns/campaign-recurrence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — 「반복 설정」 창의 「다음 발송 …」(시안 v3 · 읽기 전용 계산). 반복 발송(cron)과 같은 계산 함수 · PHT.
 * `?recurrence_kind=&recurrence_time=HH:mm&recurrence_weekday=&recurrence_start_at=&recurrence_end_at=`
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sp = req.nextUrl.searchParams;
  const b: Record<string, unknown> = {
    recurrence_kind: sp.get("recurrence_kind") ?? "",
    recurrence_time: sp.get("recurrence_time") ?? "",
    recurrence_weekday: sp.get("recurrence_weekday") ? Number(sp.get("recurrence_weekday")) : null,
    recurrence_start_at: sp.get("recurrence_start_at") ?? "",
    recurrence_end_at: sp.get("recurrence_end_at") ?? "",
  };
  const kind = String(b.recurrence_kind ?? "");
  if (kind !== "daily" && kind !== "weekly" && kind !== "monthly") {
    return NextResponse.json({ ok: false, error: "recurrence_kind_required" }, { status: 400 });
  }
  const time = typeof b.recurrence_time === "string" ? b.recurrence_time.slice(0, 5) : "";
  if (!/^\d{2}:\d{2}$/.test(time)) return NextResponse.json({ ok: false, error: "invalid_time" }, { status: 400 });
  const start = typeof b.recurrence_start_at === "string" && b.recurrence_start_at ? b.recurrence_start_at : new Date().toISOString();
  const end = typeof b.recurrence_end_at === "string" && b.recurrence_end_at ? b.recurrence_end_at : null;
  const weekday = typeof b.recurrence_weekday === "number" && Number.isFinite(b.recurrence_weekday) ? b.recurrence_weekday : null;
  const next = computeNextRecurrenceScheduledFor(
    { kind, timeLocal: time, timezone: "Asia/Manila", startAt: start, endAt: end, weekday: kind === "weekly" ? weekday : null },
    new Date(),
    1
  );
  return NextResponse.json({ ok: true, next: next ? next.toISOString() : null });
}
