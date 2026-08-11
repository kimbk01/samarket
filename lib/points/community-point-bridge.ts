import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyCommunityCommentReward,
  applyCommunityPointReclaim,
  applyCommunityPostReward,
  reclaimIfEditBecameIneligible,
} from "@/lib/community-points/apply-community-point";
import { COMMUNITY_POINT_DEFAULTS } from "@/lib/community-points/reward-eligibility";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

function resolveRewardUserType(memberType: string | null | undefined): "free" | "premium" {
  return String(memberType ?? "").trim().toLowerCase() === "premium" ? "premium" : "free";
}

async function loadAuthorProfile(
  sb: SupabaseClient,
  userId: string
): Promise<{ nickname: string; userType: "free" | "premium" }> {
  const { data } = await sb.from("profiles").select("nickname, member_type").eq("id", userId).maybeSingle();
  const row = data as { nickname?: string; member_type?: string } | null;
  return {
    nickname: String(row?.nickname ?? "").trim() || userId,
    userType: resolveRewardUserType(row?.member_type),
  };
}

function isPointsInfraReady(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err ?? "");
  return (
    !isMissingPointsTable(msg, "point_reward_executions") &&
    !isMissingPointsTable(msg, "board_point_policies")
  );
}

async function withServiceClient(task: (sb: SupabaseClient) => Promise<void>): Promise<void> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return;
  try {
    await task(sb);
  } catch (err) {
    if (isPointsInfraReady(err)) {
      console.error("[community-point-bridge]", err);
    }
  }
}

export async function applyCommunityPointRewardOnPostWrite(input: {
  userId: string;
  postId: string;
  title: string;
  content: string;
  isQuestion?: boolean;
  topicSlug?: string | null;
}): Promise<void> {
  await withServiceClient(async (sb) => {
    const author = await loadAuthorProfile(sb, input.userId);
    await applyCommunityPostReward({
      sb,
      userId: input.userId,
      userNickname: author.nickname,
      userType: author.userType,
      postId: input.postId,
      title: input.title,
      content: input.content,
      topicSlug: input.topicSlug,
      isQuestion: input.isQuestion,
    });
  });
}

export async function applyCommunityPointRewardOnCommentWrite(input: {
  userId: string;
  postId: string;
  commentId: string;
  content: string;
}): Promise<void> {
  await withServiceClient(async (sb) => {
    const author = await loadAuthorProfile(sb, input.userId);
    const { data: post } = await sb
      .from("community_posts")
      .select("user_id, is_question, topic_slug")
      .eq("id", input.postId)
      .maybeSingle();
    const row = post as { user_id?: string; is_question?: boolean; topic_slug?: string } | null;
    await applyCommunityCommentReward({
      sb,
      userId: input.userId,
      userNickname: author.nickname,
      userType: author.userType,
      postId: input.postId,
      commentId: input.commentId,
      content: input.content,
      topicSlug: row?.topic_slug,
      isQuestion: row?.is_question,
      postAuthorId: row?.user_id,
    });
  });
}

export async function applyCommunityPointReclaimOnPostDelete(input: { postId: string }): Promise<void> {
  await withServiceClient(async (sb) => {
    await applyCommunityPointReclaim({
      sb,
      targetId: input.postId,
      targetType: "post",
      triggerType: "delete",
    });
  });
}

export async function applyCommunityPointReclaimOnCommentDelete(input: {
  commentId: string;
}): Promise<void> {
  await withServiceClient(async (sb) => {
    await applyCommunityPointReclaim({
      sb,
      targetId: input.commentId,
      targetType: "comment",
      triggerType: "delete",
    });
  });
}

export async function applyCommunityPointReclaimOnModeration(input: {
  targetId: string;
  targetType: "post" | "comment";
  triggerType: "admin_remove" | "report_confirmed";
}): Promise<void> {
  await withServiceClient(async (sb) => {
    await applyCommunityPointReclaim({
      sb,
      targetId: input.targetId,
      targetType: input.targetType,
      triggerType: input.triggerType,
    });
  });
}

export async function applyCommunityPointReclaimFromReportTarget(input: {
  targetType: string;
  targetId: string;
}): Promise<void> {
  const targetId = String(input.targetId ?? "").trim();
  const tt = String(input.targetType ?? "").trim().toLowerCase();
  if (!targetId) return;
  if (tt === "post") {
    await applyCommunityPointReclaimOnModeration({
      targetId,
      targetType: "post",
      triggerType: "report_confirmed",
    });
    return;
  }
  if (tt === "comment") {
    await applyCommunityPointReclaimOnModeration({
      targetId,
      targetType: "comment",
      triggerType: "report_confirmed",
    });
  }
}

export async function applyCommunityPointReclaimOnPostAdminRemove(input: {
  postId: string;
}): Promise<void> {
  const postId = String(input.postId ?? "").trim();
  if (!postId) return;
  await applyCommunityPointReclaimOnModeration({
    targetId: postId,
    targetType: "post",
    triggerType: "admin_remove",
  });
}

export async function applyCommunityPointReclaimOnCommentEdit(input: {
  commentId: string;
  content: string;
}): Promise<void> {
  await withServiceClient(async (sb) => {
    await reclaimIfEditBecameIneligible({
      sb,
      targetId: input.commentId,
      targetType: "comment",
      content: input.content,
      minRewardChars: COMMUNITY_POINT_DEFAULTS.minRewardCommentChars,
    });
  });
}
