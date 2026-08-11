/**
 * Community D-Point application (TS orchestrator → RPC TX).
 * Eligibility is decided here; uniqueness/ledger in apply_community_point_reward.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyEventMultiplier,
  buildCommunityRewardExecutionKey,
  communityRewardAmountSeed,
  resolveFixedOrRandomBase,
} from "@/lib/community-points/deterministic-award";
import { resolveCommunityEventMultiplier } from "@/lib/community-points/event-multiplier";
import { evaluateCommunityContentAcceptance } from "@/lib/community-points/content-acceptance";
import { normalizeCommunityText } from "@/lib/community-points/content-normalize";
import { resolveCommunityPointPolicy } from "@/lib/community-points/policy-resolver";
import {
  COMMUNITY_POINT_DEFAULTS,
  evaluateRewardEligibilityText,
  isSelfComment,
  type RewardEligibilityReason,
} from "@/lib/community-points/reward-eligibility";
import {
  getActiveEventPolicyForBoardDb,
  listBoardPointPolicies,
} from "@/lib/points/point-policy-db";
import type { BoardPointPolicy } from "@/lib/types/point-policy";

export type CommunityPointApplyResult = {
  ok: boolean;
  eligible: boolean;
  reason: RewardEligibilityReason | "rpc_error" | "no_policy" | "ok";
  executionId?: string;
  ledgerId?: string | null;
  finalPoint?: number;
  idempotent?: boolean;
  error?: string;
};

function startOfUtcDayIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

async function countSuccessToday(
  sb: SupabaseClient,
  userId: string,
  actionType: "write" | "comment"
): Promise<number> {
  const { count, error } = await sb
    .from("point_reward_executions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action_type", actionType)
    .eq("status", "success")
    .gte("created_at", startOfUtcDayIso());
  if (error) return 0;
  return count ?? 0;
}

async function lastSuccessAt(
  sb: SupabaseClient,
  userId: string,
  actionType: "write" | "comment"
): Promise<number | null> {
  const { data, error } = await sb
    .from("point_reward_executions")
    .select("created_at")
    .eq("user_id", userId)
    .eq("action_type", actionType)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const t = Date.parse(String((data as { created_at?: string }).created_at ?? ""));
  return Number.isFinite(t) ? t : null;
}

async function hasDuplicateTextHash(
  sb: SupabaseClient,
  input: { userId: string; actionType: "write" | "comment"; contentHash: string }
): Promise<boolean> {
  const since = new Date(
    Date.now() - COMMUNITY_POINT_DEFAULTS.duplicateTextWindowHours * 3600_000
  ).toISOString();
  const { data, error } = await sb
    .from("point_reward_executions")
    .select("id")
    .eq("user_id", input.userId)
    .eq("action_type", input.actionType)
    .eq("status", "success")
    .gte("created_at", since)
    .contains("policy_snapshot", { content_hash: input.contentHash })
    .limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

async function callRewardRpc(
  sb: SupabaseClient,
  args: Record<string, unknown>
): Promise<CommunityPointApplyResult> {
  const { data, error } = await sb.rpc("apply_community_point_reward", args);
  if (error) {
    return { ok: false, eligible: false, reason: "rpc_error", error: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return { ok: false, eligible: false, reason: "rpc_error", error: String(row.error ?? "rpc") };
  }
  const status = String(row.status ?? "");
  const finalPoint = Number(row.final_point ?? 0);
  return {
    ok: true,
    eligible: status === "success" && finalPoint > 0,
    reason: status === "success" ? "ok" : "already_decided",
    executionId: row.execution_id ? String(row.execution_id) : undefined,
    ledgerId: row.ledger_id != null ? String(row.ledger_id) : null,
    finalPoint,
    idempotent: Boolean(row.idempotent),
  };
}

function pickCaps(policy: BoardPointPolicy, actionType: "write" | "comment") {
  return {
    dailyCap:
      actionType === "write"
        ? policy.dailyRewardPostCap ?? COMMUNITY_POINT_DEFAULTS.dailyRewardPostCap
        : policy.dailyRewardCommentCap ?? COMMUNITY_POINT_DEFAULTS.dailyRewardCommentCap,
    minChars:
      actionType === "write"
        ? policy.minRewardPostChars ?? COMMUNITY_POINT_DEFAULTS.minRewardPostChars
        : policy.minRewardCommentChars ?? COMMUNITY_POINT_DEFAULTS.minRewardCommentChars,
    cooldown:
      actionType === "write" ? policy.writeCooldownSeconds : policy.commentCooldownSeconds,
    rewardType: actionType === "write" ? policy.writeRewardType : policy.commentRewardType,
    fixed: actionType === "write" ? policy.writeFixedPoint : policy.commentFixedPoint,
    randomMin: actionType === "write" ? policy.writeRandomMin : policy.commentRandomMin,
    randomMax: actionType === "write" ? policy.writeRandomMax : policy.commentRandomMax,
  };
}

export async function applyCommunityPostReward(input: {
  sb: SupabaseClient;
  userId: string;
  userNickname: string;
  userType: "free" | "premium";
  postId: string;
  title: string;
  content: string;
  topicSlug?: string | null;
  isQuestion?: boolean;
}): Promise<CommunityPointApplyResult> {
  return applyCommunityRewardDecision({
    sb: input.sb,
    userId: input.userId,
    userNickname: input.userNickname,
    userType: input.userType,
    targetId: input.postId,
    targetType: "post",
    actionType: "write",
    content: `${input.title}\n${input.content}`,
    eligibilityText: input.content,
    topicSlug: input.topicSlug,
    isQuestion: input.isQuestion,
    postAuthorId: input.userId,
  });
}

export async function applyCommunityCommentReward(input: {
  sb: SupabaseClient;
  userId: string;
  userNickname: string;
  userType: "free" | "premium";
  postId: string;
  commentId: string;
  content: string;
  topicSlug?: string | null;
  isQuestion?: boolean;
  postAuthorId?: string | null;
}): Promise<CommunityPointApplyResult> {
  return applyCommunityRewardDecision({
    sb: input.sb,
    userId: input.userId,
    userNickname: input.userNickname,
    userType: input.userType,
    targetId: input.commentId,
    targetType: "comment",
    actionType: "comment",
    content: input.content,
    eligibilityText: input.content,
    topicSlug: input.topicSlug,
    isQuestion: input.isQuestion,
    postAuthorId: input.postAuthorId,
  });
}

async function applyCommunityRewardDecision(input: {
  sb: SupabaseClient;
  userId: string;
  userNickname: string;
  userType: "free" | "premium";
  targetId: string;
  targetType: "post" | "comment";
  actionType: "write" | "comment";
  content: string;
  eligibilityText: string;
  topicSlug?: string | null;
  isQuestion?: boolean;
  postAuthorId?: string | null;
}): Promise<CommunityPointApplyResult> {
  const policies = await listBoardPointPolicies(input.sb);
  const resolved = resolveCommunityPointPolicy({
    topicSlug: input.topicSlug,
    isQuestion: input.isQuestion,
    policies,
  });
  if (!resolved || !resolved.policy.isActive) {
    return recordBlocked(input, {
      reason: "policy_disabled",
      boardKey: "general",
      policy: resolved?.policy ?? null,
      source: resolved?.source ?? "global_default",
    });
  }

  const policy = resolved.policy;
  const caps = pickCaps(policy, input.actionType);
  const accept = evaluateCommunityContentAcceptance(
    input.eligibilityText,
    input.targetType === "comment" ? "comment" : "post_body"
  );
  const normalized = accept.ok ? accept.normalized : normalizeCommunityText(input.eligibilityText);
  const textEl = evaluateRewardEligibilityText({
    normalized,
    minMeaningfulChars: caps.minChars,
  });

  let reason: RewardEligibilityReason = textEl.ok ? "ok" : textEl.reason;
  if (input.actionType === "comment" && isSelfComment(input.postAuthorId, input.userId)) {
    reason = "self_comment";
  }

  if (reason === "ok") {
    const dup = await hasDuplicateTextHash(input.sb, {
      userId: input.userId,
      actionType: input.actionType,
      contentHash: textEl.contentHash,
    });
    if (dup) reason = "duplicate_text";
  }
  if (reason === "ok") {
    const n = await countSuccessToday(input.sb, input.userId, input.actionType);
    if (caps.dailyCap > 0 && n >= caps.dailyCap) reason = "daily_cap";
  }
  if (reason === "ok" && caps.cooldown > 0) {
    const last = await lastSuccessAt(input.sb, input.userId, input.actionType);
    if (last != null && Date.now() - last < caps.cooldown * 1000) reason = "cooldown";
  }

  const executionKey = buildCommunityRewardExecutionKey({
    targetType: input.targetType,
    targetId: input.targetId,
  });
  const event = policy.eventMultiplierEnabled
    ? (await getActiveEventPolicyForBoardDb(input.sb, policy.boardKey)) ||
      (await getActiveEventPolicyForBoardDb(input.sb, "general")) ||
      (await getActiveEventPolicyForBoardDb(input.sb, "qna"))
    : null;
  const multiplier = resolveCommunityEventMultiplier({
    event,
    eventMultiplierEnabled: policy.eventMultiplierEnabled,
    actionType: input.actionType,
    boardKey: policy.boardKey,
    source: resolved.source,
  });
  const seed = communityRewardAmountSeed({
    executionKey,
    policyId: policy.id,
    policyVersion: policy.policyVersion ?? 1,
    rewardType: caps.rewardType,
    min: caps.randomMin,
    max: caps.randomMax,
  });
  const basePoint = resolveFixedOrRandomBase({
    rewardType: caps.rewardType,
    fixedPoint: caps.fixed,
    randomMin: caps.randomMin,
    randomMax: caps.randomMax,
    seed,
  });
  let finalPoint = applyEventMultiplier(basePoint, multiplier);
  if (input.userType === "free" && policy.maxFreeUserPointCap > 0) {
    const { data: balRow } = await input.sb
      .from("profiles")
      .select("points")
      .eq("id", input.userId)
      .maybeSingle();
    const current = Number((balRow as { points?: number } | null)?.points ?? 0);
    if (current + finalPoint > policy.maxFreeUserPointCap) {
      finalPoint = Math.max(0, policy.maxFreeUserPointCap - current);
    }
  }
  if (reason === "ok" && finalPoint < 1) reason = "amount_zero";

  const eligible = reason === "ok" && finalPoint > 0;
  const snapshot = {
    policy_id: policy.id,
    policy_version: policy.policyVersion ?? 1,
    policy_layer: policy.policyLayer,
    resolve_source: resolved.source,
    board_key: policy.boardKey,
    topic_slug: resolved.topicSlug,
    reward_type: caps.rewardType,
    random_min: caps.randomMin,
    random_max: caps.randomMax,
    base_awarded: basePoint,
    multiplier,
    final_awarded: eligible ? finalPoint : 0,
    source_type: input.targetType === "comment" ? "community_comment" : "community_post",
    source_id: input.targetId,
    action: "create",
    content_hash: textEl.contentHash,
    eligibility_reason: reason,
  };

  const description = buildLedgerDescription({
    actionType: input.actionType,
    isQna: resolved.isQna,
    topicSlug: resolved.topicSlug,
    boardName: policy.boardName,
    rewardType: caps.rewardType,
    randomMin: caps.randomMin,
    randomMax: caps.randomMax,
    basePoint,
    multiplier,
    finalPoint: eligible ? finalPoint : 0,
    content: input.eligibilityText,
  });

  return callRewardRpc(input.sb, {
    p_user_id: input.userId,
    p_execution_key: executionKey,
    p_board_key: policy.boardKey,
    p_action_type: input.actionType,
    p_target_id: input.targetId,
    p_target_type: input.targetType,
    p_user_nickname: input.userNickname,
    p_user_type: input.userType,
    p_reward_type: caps.rewardType,
    p_base_point: basePoint,
    p_multiplier: multiplier,
    p_final_point: eligible ? finalPoint : 0,
    p_status: eligible ? "success" : "blocked",
    p_reason: eligible ? null : reason,
    p_policy_snapshot: snapshot,
    p_description: description,
    p_capped: false,
    p_cooldown_blocked: reason === "cooldown",
    p_duplicate_blocked: reason === "duplicate_text" || reason === "already_decided",
  });
}

async function recordBlocked(
  input: {
    sb: SupabaseClient;
    userId: string;
    userNickname: string;
    userType: "free" | "premium";
    targetId: string;
    targetType: "post" | "comment";
    actionType: "write" | "comment";
  },
  extra: {
    reason: RewardEligibilityReason;
    boardKey: string;
    policy: BoardPointPolicy | null;
    source: string;
  }
): Promise<CommunityPointApplyResult> {
  return callRewardRpc(input.sb, {
    p_user_id: input.userId,
    p_execution_key: buildCommunityRewardExecutionKey({
      targetType: input.targetType,
      targetId: input.targetId,
    }),
    p_board_key: extra.boardKey,
    p_action_type: input.actionType,
    p_target_id: input.targetId,
    p_target_type: input.targetType,
    p_user_nickname: input.userNickname,
    p_user_type: input.userType,
    p_reward_type: "fixed",
    p_base_point: 0,
    p_multiplier: 1,
    p_final_point: 0,
    p_status: "blocked",
    p_reason: extra.reason,
    p_policy_snapshot: { eligibility_reason: extra.reason, resolve_source: extra.source },
    p_description: "커뮤니티 보상 없음",
    p_capped: false,
    p_cooldown_blocked: extra.reason === "cooldown",
    p_duplicate_blocked: false,
  });
}

function buildLedgerDescription(input: {
  actionType: "write" | "comment";
  isQna: boolean;
  topicSlug: string;
  boardName: string;
  rewardType: "fixed" | "random";
  randomMin: number;
  randomMax: number;
  basePoint: number;
  multiplier: number;
  finalPoint: number;
  content: string;
}): string {
  const action =
    input.actionType === "write"
      ? input.isQna
        ? "커뮤니티 질문 작성"
        : "커뮤니티 게시글 작성"
      : "커뮤니티 댓글 작성";
  const board = input.boardName || input.topicSlug || (input.isQna ? "Q&A" : "커뮤니티");
  const preview = input.content.replace(/\s+/g, " ").trim().slice(0, 40);
  const randomBit =
    input.rewardType === "random"
      ? `랜덤 ${input.randomMin}~${input.randomMax}P 중 ${input.basePoint}P`
      : `고정 ${input.basePoint}P`;
  const mult = input.multiplier && input.multiplier !== 1 ? ` ×${input.multiplier}` : "";
  return `${action} · ${board} · ${randomBit}${mult} · "${preview}"`.slice(0, 500);
}

export async function applyCommunityPointReclaim(input: {
  sb: SupabaseClient;
  targetId: string;
  targetType: "post" | "comment";
  triggerType: "delete" | "admin_remove" | "report_confirmed" | "eligibility_lost";
}): Promise<{ ok: boolean; skipped?: boolean; idempotent?: boolean; error?: string; balanceAfter?: number }> {
  const { data, error } = await input.sb.rpc("apply_community_point_reclaim", {
    p_target_id: input.targetId,
    p_target_type: input.targetType,
    p_trigger_type: input.triggerType,
  });
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return { ok: false, error: String(row.error ?? "rpc") };
  return {
    ok: true,
    skipped: Boolean(row.skipped),
    idempotent: Boolean(row.idempotent),
    balanceAfter: row.balance_after != null ? Number(row.balance_after) : undefined,
  };
}

export async function reclaimIfEditBecameIneligible(input: {
  sb: SupabaseClient;
  targetId: string;
  targetType: "post" | "comment";
  content: string;
  minRewardChars: number;
}): Promise<void> {
  const accept = evaluateCommunityContentAcceptance(
    input.content,
    input.targetType === "comment" ? "comment" : "post_body"
  );
  if (!accept.ok) return;
  const el = evaluateRewardEligibilityText({
    normalized: accept.normalized,
    minMeaningfulChars: input.minRewardChars,
  });
  if (el.ok) return;
  await applyCommunityPointReclaim({
    sb: input.sb,
    targetId: input.targetId,
    targetType: input.targetType,
    triggerType: "eligibility_lost",
  });
}
