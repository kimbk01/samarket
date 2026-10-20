import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { adminListRange, parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";
import {
  listPointReclaimPolicies,
  listPointRewardExecutions,
  listPointRewardLogs,
} from "@/lib/points/point-execution-db";
import type { PointRewardExecution } from "@/lib/types/point-execution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXEC_STATUSES = new Set(["success", "blocked", "reversed"]);
const ACTION_TYPES = new Set(["write", "comment"]);

function rowToExecution(row: Record<string, unknown>): PointRewardExecution {
  return {
    id: String(row.id ?? ""),
    executionKey: String(row.execution_key ?? ""),
    boardKey: String(row.board_key ?? ""),
    actionType: String(row.action_type ?? "write") as PointRewardExecution["actionType"],
    targetId: String(row.target_id ?? ""),
    targetType: String(row.target_type ?? "post") as PointRewardExecution["targetType"],
    userId: String(row.user_id ?? ""),
    userNickname: String(row.user_nickname ?? ""),
    userType: String(row.user_type ?? "free") as PointRewardExecution["userType"],
    rewardType: String(row.reward_type ?? "fixed") as PointRewardExecution["rewardType"],
    basePoint: Number(row.base_point ?? 0),
    appliedMultiplier: Number(row.applied_multiplier ?? 1),
    finalPoint: Number(row.final_point ?? 0),
    capped: Boolean(row.capped),
    cooldownBlocked: Boolean(row.cooldown_blocked),
    duplicateBlocked: Boolean(row.duplicate_blocked),
    status: String(row.status ?? "blocked") as PointRewardExecution["status"],
    reason: row.reason ? String(row.reason) : undefined,
    createdAt: String(row.created_at ?? ""),
    reversedAt: row.reversed_at ? String(row.reversed_at) : undefined,
  };
}

/**
 * GET /api/admin/point-executions
 * - 파라미터 없음: 기존 동작 그대로 (실행 이력 최근 200건 + 회수 정책 + 지급 로그).
 * - `limit`/`offset` 이 있으면 서버 페이지네이션: `status`·`boardKey`·`actionType`·`userId` 필터 적용 후
 *   해당 쪽 실행 이력 + 정확한 전체 건수(`total`, `limit`, `offset`)를 함께 돌려준다.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  try {
    const sp = new URL(req.url).searchParams;
    const paged = sp.has("limit") || sp.has("offset");
    if (!paged) {
      const [executions, reclaimPolicies, rewardLogs] = await Promise.all([
        listPointRewardExecutions(gate.sb),
        listPointReclaimPolicies(gate.sb),
        listPointRewardLogs(gate.sb),
      ]);
      return NextResponse.json({ ok: true, executions, reclaimPolicies, rewardLogs });
    }

    const page = parseAdminListPage(sp, { defaultLimit: 20, maxLimit: 100 });
    const [from, to] = adminListRange(page);
    let q = gate.sb.from("point_reward_executions").select("*", { count: "exact" });
    const status = (sp.get("status") ?? "").trim();
    if (EXEC_STATUSES.has(status)) q = q.eq("status", status);
    const boardKey = (sp.get("boardKey") ?? "").trim();
    if (boardKey) q = q.eq("board_key", boardKey);
    const actionType = (sp.get("actionType") ?? "").trim();
    if (ACTION_TYPES.has(actionType)) q = q.eq("action_type", actionType);
    const userId = (sp.get("userId") ?? "").trim();
    if (userId) q = q.eq("user_id", userId);

    const [execRes, reclaimPolicies, rewardLogs] = await Promise.all([
      q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to),
      listPointReclaimPolicies(gate.sb),
      listPointRewardLogs(gate.sb),
    ]);
    if (execRes.error) {
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    }
    const executions = (execRes.data ?? []).map((r) => rowToExecution(r as Record<string, unknown>));
    return NextResponse.json({
      ok: true,
      executions,
      total: execRes.count ?? executions.length,
      limit: page.limit,
      offset: page.offset,
      reclaimPolicies,
      rewardLogs,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
