import type { SupabaseClient } from "@supabase/supabase-js";
import type { PointReclaimTriggerType } from "@/lib/types/point-execution";
import {
  getPointReclaimPolicyByTargetAndTriggerDb,
  insertPointActionLogDb,
  insertPointRewardLog,
} from "@/lib/points/point-execution-db";
import { spendUserPoints } from "@/lib/points/user-point-ledger";

export interface ExecutePointReclaimInput {
  targetId: string;
  targetType: "post" | "comment";
  triggerType: PointReclaimTriggerType;
}

export async function executePointReclaimServer(
  sb: SupabaseClient,
  input: ExecutePointReclaimInput
): Promise<void> {
  const policy = await getPointReclaimPolicyByTargetAndTriggerDb(
    sb,
    input.targetType,
    input.triggerType
  );
  if (!policy || !policy.isActive) return;

  const { data: executions, error } = await sb
    .from("point_reward_executions")
    .select("*")
    .eq("target_id", input.targetId)
    .eq("target_type", input.targetType)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = executions?.[0] as Record<string, unknown> | undefined;
  if (!row) return;

  const finalPoint = Number(row.final_point ?? 0);
  if (finalPoint <= 0) return;

  const reclaimAmount =
    policy.reclaimMode === "full"
      ? finalPoint
      : Math.round((finalPoint * policy.reclaimPercent) / 100);
  if (reclaimAmount < 1) return;

  const userId = String(row.user_id ?? "");
  const userNickname = String(row.user_nickname ?? "");
  const executionId = String(row.id ?? "");

  const spend = await spendUserPoints(sb, {
    userId,
    amount: reclaimAmount,
    entryType: "reverse",
    relatedType: "community_reclaim",
    relatedId: executionId,
    description: `${input.targetType === "post" ? "글" : "댓글"} 삭제로 인한 포인트 회수`,
    actorType: "system",
  });
  if (!spend.ok) return;

  await sb
    .from("point_reward_executions")
    .update({ status: "reversed", reversed_at: new Date().toISOString() })
    .eq("id", executionId);

  await insertPointActionLogDb(sb, {
    actionType: "community_reclaim",
    actorType: "system",
    actorId: "system",
    actorNickname: "시스템",
    targetUserId: userId,
    targetUserNickname: userNickname,
    relatedId: executionId,
    note: `포인트 회수 -${reclaimAmount}P (${input.targetType} ${input.targetId})`,
  });

  await insertPointRewardLog(sb, {
    executionId,
    relatedLedgerId: spend.ledgerId ?? "",
    actionType: "reclaim",
    boardKey: String(row.board_key ?? ""),
    targetId: input.targetId,
    targetType: input.targetType,
    userId,
    pointAmount: -reclaimAmount,
    balanceAfter: spend.balanceAfter,
    note: `${input.targetType} 삭제 회수`,
    createdAt: new Date().toISOString(),
  });
}
