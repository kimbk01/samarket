import type { SupabaseClient } from "@supabase/supabase-js";
import { executePointReclaimServer } from "@/lib/point-executions/execute-point-reclaim-server";
import { executePointRewardServer } from "@/lib/point-executions/execute-point-reward-server";
import { resolveCommunityBoardKey } from "@/lib/points/community-point-board-key";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { PointRewardUserType } from "@/lib/types/point-execution";

function resolveRewardUserType(memberType: string | null | undefined): PointRewardUserType {
  return String(memberType ?? "").trim().toLowerCase() === "premium" ? "premium" : "free";
}

async function loadAuthorProfile(
  sb: SupabaseClient,
  userId: string
): Promise<{ nickname: string; userType: PointRewardUserType }> {
  const { data } = await sb.from("profiles").select("nickname, member_type").eq("id", userId).maybeSingle();
  const row = data as { nickname?: string; member_type?: string } | null;
  return {
    nickname: String(row?.nickname ?? "").trim() || userId,
    userType: resolveRewardUserType(row?.member_type),
  };
}

function runPointSideEffect(task: () => Promise<void>): void {
  void task().catch((err) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[community-point-bridge]", err);
    }
  });
}

function isPointsInfraReady(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err ?? "");
  return !isMissingPointsTable(msg, "point_reward_executions") && !isMissingPointsTable(msg, "board_point_policies");
}

async function withServiceClient(task: (sb: SupabaseClient) => Promise<void>): Promise<void> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return;
  try {
    await task(sb);
  } catch (err) {
    if (isPointsInfraReady(err)) throw err;
  }
}

/** 글 작성 성공 후 커뮤니티 포인트 지급 (비동기·실패 무시) */
export function voidCommunityPointRewardOnPostWrite(input: {
  userId: string;
  postId: string;
  isQuestion?: boolean;
  topicSlug?: string | null;
  category?: string | null;
}): void {
  runPointSideEffect(async () => {
    await withServiceClient(async (sb) => {
      const author = await loadAuthorProfile(sb, input.userId);
      const boardKey = resolveCommunityBoardKey(input);
      await executePointRewardServer(sb, {
        boardKey,
        actionType: "write",
        targetId: input.postId,
        targetType: "post",
        userId: input.userId,
        userNickname: author.nickname,
        userType: author.userType,
      });
    });
  });
}

/** 댓글 작성 성공 후 커뮤니티 포인트 지급 */
export function voidCommunityPointRewardOnCommentWrite(input: {
  userId: string;
  postId: string;
  commentId: string;
}): void {
  runPointSideEffect(async () => {
    await withServiceClient(async (sb) => {
      const author = await loadAuthorProfile(sb, input.userId);
      const { data: post } = await sb
        .from("community_posts")
        .select("is_question, topic_slug, category")
        .eq("id", input.postId)
        .maybeSingle();
      const row = post as { is_question?: boolean; topic_slug?: string; category?: string } | null;
      const boardKey = resolveCommunityBoardKey({
        isQuestion: row?.is_question,
        topicSlug: row?.topic_slug,
        category: row?.category,
      });
      await executePointRewardServer(sb, {
        boardKey,
        actionType: "comment",
        targetId: input.commentId,
        targetType: "comment",
        userId: input.userId,
        userNickname: author.nickname,
        userType: author.userType,
      });
    });
  });
}

/** 글 삭제 시 포인트 회수 */
export function voidCommunityPointReclaimOnPostDelete(input: { postId: string }): void {
  runPointSideEffect(async () => {
    await withServiceClient(async (sb) => {
      await executePointReclaimServer(sb, {
        targetId: input.postId,
        targetType: "post",
        triggerType: "delete",
      });
    });
  });
}

/** 댓글 삭제 시 포인트 회수 */
export function voidCommunityPointReclaimOnCommentDelete(input: { commentId: string }): void {
  runPointSideEffect(async () => {
    await withServiceClient(async (sb) => {
      await executePointReclaimServer(sb, {
        targetId: input.commentId,
        targetType: "comment",
        triggerType: "delete",
      });
    });
  });
}

/** 신고 확정·관리자 삭제 등 운영 회수 (API·어드민에서 호출) */
export function voidCommunityPointReclaimOnModeration(input: {
  targetId: string;
  targetType: "post" | "comment";
  triggerType: "admin_remove" | "report_confirmed";
}): void {
  runPointSideEffect(async () => {
    await withServiceClient(async (sb) => {
      await executePointReclaimServer(sb, input);
    });
  });
}

/** community_reports.target_type → 포인트 회수 대상 */
export function voidCommunityPointReclaimFromReportTarget(input: {
  targetType: string;
  targetId: string;
}): void {
  const targetId = String(input.targetId ?? "").trim();
  const tt = String(input.targetType ?? "").trim().toLowerCase();
  if (!targetId) return;
  if (tt === "post") {
    voidCommunityPointReclaimOnModeration({
      targetId,
      targetType: "post",
      triggerType: "report_confirmed",
    });
    return;
  }
  if (tt === "comment") {
    voidCommunityPointReclaimOnModeration({
      targetId,
      targetType: "comment",
      triggerType: "report_confirmed",
    });
  }
}

/** 관리자 글 숨김·삭제 시 포인트 회수 */
export function voidCommunityPointReclaimOnPostAdminRemove(input: { postId: string }): void {
  const postId = String(input.postId ?? "").trim();
  if (!postId) return;
  voidCommunityPointReclaimOnModeration({
    targetId: postId,
    targetType: "post",
    triggerType: "admin_remove",
  });
}
