/**
 * 추천 운영·분석 기록 — 서버 전용 DB 접근 (service role, 관리자 가드 통과 후 API 라우트에서만 호출).
 * 목록·요약 = RPC (마이그레이션 20270601200000_r7_recommendation_records.sql) · 쓰기 = 건별 INSERT/UPDATE.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { AutomationActionType, RecommendationAutomationExecution } from "@/lib/types/recommendation-automation";
import type {
  IncidentStatus,
  RecommendationAlertEvent,
  RecommendationIncident,
} from "@/lib/types/recommendation-monitoring";
import type { RecommendationExperimentsBundleV1 } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import {
  RECOMMENDATION_RECORDS_MAX_PAGE_SIZE,
  RECOMMENDATION_RECORDS_RPC,
  RECOMMENDATION_RECORDS_TABLE,
  parseRecommendationRecordsPage,
  parseRecommendationRecordsSummary,
  recommendationExperimentGroupKey,
  type RecommendationAutomationExecutionInput,
  type RecommendationImpressionUserGroup,
  type RecommendationRecordsPage,
  type RecommendationRecordsSummary,
} from "@/lib/recommendation-ops/recommendation-records-contract";

export type RecordsResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export type RecordsPageArgs = { limit: number; offset: number };

function pageArgs(p: RecordsPageArgs): { p_limit: number; p_offset: number } {
  return {
    p_limit: Math.min(RECOMMENDATION_RECORDS_MAX_PAGE_SIZE, Math.max(1, Math.floor(p.limit))),
    p_offset: Math.max(0, Math.floor(p.offset)),
  };
}

async function callPageRpc<T>(
  sb: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<RecordsResult<RecommendationRecordsPage<T>>> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, status: 500, error: error.message || "rpc_failed" };
  const page = parseRecommendationRecordsPage<T>(data);
  if (!page) return { ok: false, status: 500, error: "rpc_bad_shape" };
  return { ok: true, value: page };
}

/* ─── 목록 (서버 페이지) ───────────────────────────────────── */

export function loadRecommendationIncidentsPage(
  sb: SupabaseClient,
  q: RecordsPageArgs & { status: IncidentStatus | null; surface: RecommendationSurface | null }
) {
  return callPageRpc<RecommendationIncident>(sb, RECOMMENDATION_RECORDS_RPC.incidentsPage, {
    p_status: q.status,
    p_surface: q.surface,
    ...pageArgs(q),
  });
}

export function loadRecommendationAlertEventsPage(
  sb: SupabaseClient,
  q: RecordsPageArgs & { acknowledged: boolean | null; surface: RecommendationSurface | null }
) {
  return callPageRpc<RecommendationAlertEvent>(sb, RECOMMENDATION_RECORDS_RPC.alertEventsPage, {
    p_acknowledged: q.acknowledged,
    p_surface: q.surface,
    ...pageArgs(q),
  });
}

export function loadRecommendationAutomationExecutionsPage(
  sb: SupabaseClient,
  q: RecordsPageArgs & { surface: RecommendationSurface | null; actionType: AutomationActionType | null }
) {
  return callPageRpc<RecommendationAutomationExecution>(sb, RECOMMENDATION_RECORDS_RPC.automationExecutionsPage, {
    p_surface: q.surface,
    p_action_type: q.actionType,
    ...pageArgs(q),
  });
}

/* ─── 요약 ───────────────────────────────────────────────────── */

/** 실험별·버전별 배정 회원 → 노출 집계 그룹 (실험 성과 카드·비교표·승자 선택). */
export function buildExperimentImpressionUserGroups(
  bundle: Pick<RecommendationExperimentsBundleV1, "experiments" | "userFeedAssignments">
): RecommendationImpressionUserGroup[] {
  const out: RecommendationImpressionUserGroup[] = [];
  for (const exp of bundle.experiments ?? []) {
    const versionIds = [exp.controlVersionId, ...(exp.variantVersionIds ?? [])];
    for (const versionId of versionIds) {
      const userIds = [
        ...new Set(
          (bundle.userFeedAssignments ?? [])
            .filter((a) => a.experimentId === exp.id && a.assignedVersionId === versionId)
            .map((a) => a.userId)
        ),
      ];
      out.push({ key: recommendationExperimentGroupKey(exp.id, versionId), surface: exp.targetSurface, userIds });
    }
  }
  return out;
}

export async function loadRecommendationRecordsSummary(
  sb: SupabaseClient,
  q: { sinceIso: string; userGroups: RecommendationImpressionUserGroup[] }
): Promise<RecordsResult<RecommendationRecordsSummary>> {
  const { data, error } = await sb.rpc(RECOMMENDATION_RECORDS_RPC.summary, {
    p_since: q.sinceIso,
    p_user_groups: q.userGroups,
  });
  if (error) return { ok: false, status: 500, error: error.message || "rpc_failed" };
  const summary = parseRecommendationRecordsSummary(data);
  if (!summary) return { ok: false, status: 500, error: "rpc_bad_shape" };
  return { ok: true, value: summary };
}

/* ─── 건별 쓰기 ─────────────────────────────────────────────── */

type ExecutionRow = {
  id: string;
  surface: RecommendationSurface;
  incident_id: string | null;
  action_type: RecommendationAutomationExecution["actionType"];
  execution_mode: RecommendationAutomationExecution["executionMode"];
  status: RecommendationAutomationExecution["status"];
  reason: string;
  before_state: string;
  after_state: string;
  created_at: string;
  completed_at: string | null;
};

export function mapExecutionRow(r: ExecutionRow): RecommendationAutomationExecution {
  return {
    id: r.id,
    surface: r.surface,
    incidentId: r.incident_id,
    actionType: r.action_type,
    executionMode: r.execution_mode,
    status: r.status,
    reason: r.reason,
    beforeState: r.before_state,
    afterState: r.after_state,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

/** 자동화 실행 1건 INSERT — 시각은 서버 기준. */
export async function insertRecommendationAutomationExecution(
  sb: SupabaseClient,
  input: RecommendationAutomationExecutionInput,
  adminId: string
): Promise<RecordsResult<RecommendationAutomationExecution>> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(RECOMMENDATION_RECORDS_TABLE.automationExecutions)
    .insert({
      id: `rex-${randomUUID()}`,
      surface: input.surface,
      incident_id: input.incidentId,
      action_type: input.actionType,
      execution_mode: input.executionMode,
      status: input.status,
      reason: input.reason,
      before_state: input.beforeState,
      after_state: input.afterState,
      created_by_admin_id: adminId,
      created_at: now,
      completed_at: now,
    })
    .select(
      "id, surface, incident_id, action_type, execution_mode, status, reason, before_state, after_state, created_at, completed_at"
    )
    .single();
  if (error || !data) return { ok: false, status: 500, error: error?.message || "insert_failed" };
  return { ok: true, value: mapExecutionRow(data as ExecutionRow) };
}

const INCIDENT_ACTION_FROM: Record<"acknowledge" | "resolve", IncidentStatus[]> = {
  acknowledge: ["open"],
  resolve: ["open", "acknowledged"],
};

/** 이슈 확인(open→acknowledged) · 해결(open|acknowledged→resolved) — 조건부 UPDATE 1건. */
export async function updateRecommendationIncidentStatus(
  sb: SupabaseClient,
  id: string,
  action: "acknowledge" | "resolve",
  admin: { id: string; nickname: string | null }
): Promise<RecordsResult<{ id: string; status: IncidentStatus }>> {
  const now = new Date().toISOString();
  const patch =
    action === "acknowledge"
      ? {
          status: "acknowledged" as const,
          acknowledged_at: now,
          acknowledged_by_admin_id: admin.id,
          acknowledged_by_admin_nickname: admin.nickname,
        }
      : { status: "resolved" as const, resolved_at: now };
  const { data, error } = await sb
    .from(RECOMMENDATION_RECORDS_TABLE.incidents)
    .update(patch)
    .eq("id", id)
    .in("status", INCIDENT_ACTION_FROM[action])
    .select("id, status")
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message || "update_failed" };
  if (!data) return { ok: false, status: 409, error: "not_found_or_state_changed" };
  return { ok: true, value: data as { id: string; status: IncidentStatus } };
}

/** 알림 이벤트 확인 — 미확인 1건만 UPDATE. */
export async function acknowledgeRecommendationAlertEventInDb(
  sb: SupabaseClient,
  id: string,
  adminId: string
): Promise<RecordsResult<{ id: string }>> {
  const { data, error } = await sb
    .from(RECOMMENDATION_RECORDS_TABLE.alertEvents)
    .update({ is_acknowledged: true, acknowledged_at: new Date().toISOString(), acknowledged_by_admin_id: adminId })
    .eq("id", id)
    .eq("is_acknowledged", false)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message || "update_failed" };
  if (!data) return { ok: false, status: 409, error: "not_found_or_state_changed" };
  return { ok: true, value: data as { id: string } };
}

/** 확인한 관리자 표시 이름 (profiles.nickname). 없으면 null. */
export async function loadAdminNickname(sb: SupabaseClient, adminId: string): Promise<string | null> {
  const { data } = await sb.from("profiles").select("nickname").eq("id", adminId).maybeSingle();
  const nick = (data as { nickname?: unknown } | null)?.nickname;
  return typeof nick === "string" && nick.trim() ? nick.trim() : null;
}
