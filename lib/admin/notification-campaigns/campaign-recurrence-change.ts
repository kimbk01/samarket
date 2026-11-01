import type { SupabaseClient } from "@supabase/supabase-js";
import {
  editCampaign,
  loadCampaignForAction,
  pauseRecurringCampaign,
  resumeRecurringCampaign,
  writeLifecycleAudit,
} from "@/lib/admin/notification-campaigns/campaign-lifecycle-service";
import { mergeCampaignPatchOverRow, parseCampaignWriteInput } from "@/lib/admin/notification-campaigns/campaign-input";

export type RecurringScheduleInput = {
  recurrence_kind: unknown;
  recurrence_time: unknown;
  recurrence_weekday?: unknown;
  recurrence_start_at?: unknown;
  recurrence_end_at?: unknown;
};

export type RecurringScheduleChangeResult =
  | { ok: true; campaignId: string; status: string }
  | { ok: false; status: number; error: string };

/**
 * 「반복 설정」(시안 v3) — 진행 중인 반복의 주기·시각·기간을 바꾼다.
 * 기존 수명 주기 그대로: 진행 중(active)이면 일시정지 → 수정(editCampaign: 계획된 다음 회차 취소) → 재개.
 * 일시정지 상태면 수정만(재개는 운영자가 고른다). 각 단계 감사 기록. 수정이 실패하면 멈춘 반복을 다시 재개한다.
 */
export async function changeRecurringSchedule(
  svc: SupabaseClient,
  campaignId: string,
  actorId: string,
  input: RecurringScheduleInput,
  ip: string | null
): Promise<RecurringScheduleChangeResult> {
  const first = await loadCampaignForAction(svc, campaignId);
  if (!first.ok) return { ok: false, status: first.status, error: first.error };
  const startStatus = first.loaded.ctx.status;
  if (String(first.loaded.row.send_mode ?? "") !== "recurring" || (startStatus !== "active" && startStatus !== "paused")) {
    return { ok: false, status: 409, error: "not_recurring_series" };
  }

  // 값 검사를 먼저 — 잘못된 값으로 반복을 멈추지 않는다.
  const patch = {
    send_mode: "recurring",
    recurrence_kind: input.recurrence_kind,
    recurrence_time: input.recurrence_time,
    recurrence_timezone: "Asia/Manila",
    recurrence_weekday: input.recurrence_kind === "weekly" ? input.recurrence_weekday ?? null : null,
    recurrence_start_at: input.recurrence_start_at ?? first.loaded.row.recurrence_start_at ?? new Date().toISOString(),
    recurrence_end_at: input.recurrence_end_at ?? null,
  };
  const precheck = parseCampaignWriteInput(mergeCampaignPatchOverRow(first.loaded.row, patch).body, { hasOwnTargetPayload: false });
  if (!precheck.ok) return { ok: false, status: precheck.status, error: precheck.error };
  const kind = String(input.recurrence_kind ?? "");
  if (kind !== "daily" && kind !== "weekly" && kind !== "monthly") {
    return { ok: false, status: 400, error: "recurrence_kind_required" };
  }

  let loaded = first.loaded;
  if (startStatus === "active") {
    const paused = await pauseRecurringCampaign(svc, loaded, actorId);
    if (!paused.ok) return paused;
    await writeLifecycleAudit(svc, paused, actorId, ip);
    const reload = await loadCampaignForAction(svc, campaignId);
    if (!reload.ok) return { ok: false, status: reload.status, error: reload.error };
    loaded = reload.loaded;
  }

  const parsed = parseCampaignWriteInput(mergeCampaignPatchOverRow(loaded.row, patch).body, { hasOwnTargetPayload: false });
  const edited = parsed.ok ? await editCampaign(svc, loaded, actorId, parsed.fields) : null;
  if (!parsed.ok || !edited || !edited.ok) {
    if (startStatus === "active") {
      const back = await loadCampaignForAction(svc, campaignId);
      if (back.ok) {
        const resumed = await resumeRecurringCampaign(svc, back.loaded, actorId);
        if (resumed.ok) await writeLifecycleAudit(svc, resumed, actorId, ip);
      }
    }
    if (!parsed.ok) return { ok: false, status: parsed.status, error: parsed.error };
    return edited && !edited.ok ? edited : { ok: false, status: 500, error: "edit_failed" };
  }
  await writeLifecycleAudit(svc, edited, actorId, ip);

  if (startStatus === "active") {
    const reload = await loadCampaignForAction(svc, campaignId);
    if (!reload.ok) return { ok: false, status: reload.status, error: reload.error };
    const resumed = await resumeRecurringCampaign(svc, reload.loaded, actorId);
    if (!resumed.ok) return resumed;
    await writeLifecycleAudit(svc, resumed, actorId, ip);
    return { ok: true, campaignId, status: "active" };
  }
  return { ok: true, campaignId, status: "paused" };
}
