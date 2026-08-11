import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  communityAcceptanceErrorMessage,
  evaluateCommunityContentAcceptance,
  evaluateCommunityPostAcceptance,
} from "@/lib/community-points/content-acceptance";
import {
  applyEventMultiplier,
  buildCommunityRewardExecutionKey,
  communityRewardAmountSeed,
  deterministicIntInRange,
  resolveFixedOrRandomBase,
} from "@/lib/community-points/deterministic-award";
import {
  COMMUNITY_GLOBAL_BOARD_KEY,
  COMMUNITY_QNA_BOARD_KEY,
  resolveCommunityPointPolicy,
} from "@/lib/community-points/policy-resolver";
import {
  evaluateRewardEligibilityText,
  isSelfComment,
} from "@/lib/community-points/reward-eligibility";
import { normalizeCommunityText } from "@/lib/community-points/content-normalize";
import type { BoardPointPolicy } from "@/lib/types/point-policy";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function policy(partial: Partial<BoardPointPolicy> & Pick<BoardPointPolicy, "boardKey">): BoardPointPolicy {
  const boardKey = partial.boardKey;
  return {
    id: partial.id ?? `bpp-${boardKey}`,
    boardKey,
    boardName: partial.boardName ?? boardKey,
    isActive: partial.isActive ?? true,
    writeRewardType: partial.writeRewardType ?? "fixed",
    writeFixedPoint: partial.writeFixedPoint ?? 5,
    writeRandomMin: partial.writeRandomMin ?? 3,
    writeRandomMax: partial.writeRandomMax ?? 10,
    writeCooldownSeconds: partial.writeCooldownSeconds ?? 60,
    commentRewardType: partial.commentRewardType ?? "fixed",
    commentFixedPoint: partial.commentFixedPoint ?? 2,
    commentRandomMin: partial.commentRandomMin ?? 1,
    commentRandomMax: partial.commentRandomMax ?? 3,
    commentCooldownSeconds: partial.commentCooldownSeconds ?? 30,
    likeRewardPoint: 0,
    reportRewardPoint: 0,
    maxFreeUserPointCap: 500,
    eventMultiplierEnabled: partial.eventMultiplierEnabled ?? true,
    inheritGlobal: partial.inheritGlobal ?? false,
    policyLayer: partial.policyLayer ?? "topic",
    dailyRewardPostCap: partial.dailyRewardPostCap ?? 10,
    dailyRewardCommentCap: partial.dailyRewardCommentCap ?? 30,
    minRewardPostChars: partial.minRewardPostChars ?? 10,
    minRewardCommentChars: partial.minRewardCommentChars ?? 8,
    policyVersion: partial.policyVersion ?? 1,
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
}

describe("T1-T3 Level 1 BLOCK", () => {
  it("T1 empty / whitespace post BLOCK", () => {
    expect(evaluateCommunityPostAcceptance({ title: "", content: "hello" }).ok).toBe(false);
    expect(evaluateCommunityContentAcceptance("   ", "post_body").ok).toBe(false);
    expect(evaluateCommunityContentAcceptance("", "comment").ok).toBe(false);
  });

  it("T2 punctuation-only BLOCK", () => {
    expect(evaluateCommunityContentAcceptance(".", "post_body").ok).toBe(false);
    expect(evaluateCommunityContentAcceptance("......", "post_body").ok).toBe(false);
    expect(evaluateCommunityContentAcceptance("?", "comment").ok).toBe(false);
    expect(evaluateCommunityContentAcceptance("???", "comment").ok).toBe(false);
  });

  it("T3 repeated-only BLOCK", () => {
    expect(evaluateCommunityContentAcceptance("ㅋㅋㅋㅋㅋㅋ", "comment").ok).toBe(false);
    expect(evaluateCommunityContentAcceptance("ㅎㅎㅎㅎㅎㅎ", "post_body").ok).toBe(false);
    expect(evaluateCommunityContentAcceptance("aaaaaaaa", "post_body").ok).toBe(false);
    expect(evaluateCommunityContentAcceptance("11111111", "comment").ok).toBe(false);
  });
});

describe("T4-T11 Level 1 ALLOW / Level 2 NO", () => {
  it("allows meaningful post/comment", () => {
    const post = evaluateCommunityPostAcceptance({
      title: "오늘 마닐라 날씨",
      content: "오늘 마닐라 비 오나요?",
    });
    expect(post.ok).toBe(true);
    expect(evaluateCommunityContentAcceptance("오늘 마닐라 비 오나요?", "comment").ok).toBe(true);
  });

  it("감사합니다 / test / asdf ALLOW content, POINT NO", () => {
    for (const text of ["감사합니다", "test", "asdf", "네"]) {
      const accept = evaluateCommunityContentAcceptance(text, "comment");
      expect(accept.ok).toBe(true);
      if (!accept.ok) continue;
      const el = evaluateRewardEligibilityText({
        normalized: accept.normalized,
        minMeaningfulChars: 8,
      });
      expect(el.ok).toBe(false);
    }
  });

  it("T8 self-comment is identity match", () => {
    expect(isSelfComment("user-a", "user-a")).toBe(true);
    expect(isSelfComment("user-a", "user-b")).toBe(false);
  });

  it("normal long comment is reward-eligible on text", () => {
    const n = normalizeCommunityText("오늘 마닐라 비 오나요?");
    const el = evaluateRewardEligibilityText({ normalized: n, minMeaningfulChars: 8 });
    expect(el.ok).toBe(true);
  });
});

describe("T12-T14 random + multiplier", () => {
  it("deterministic range and retry same", () => {
    const seed = communityRewardAmountSeed({
      executionKey: "community_post:create:abc",
      policyId: "bpp-2",
      policyVersion: 1,
      rewardType: "random",
      min: 3,
      max: 10,
    });
    const a = deterministicIntInRange(seed, 3, 10);
    const b = deterministicIntInRange(seed, 3, 10);
    expect(a).toBeGreaterThanOrEqual(3);
    expect(a).toBeLessThanOrEqual(10);
    expect(a).toBe(b);
    const other = deterministicIntInRange(`${seed}|other`, 3, 10);
    expect(other).toBeGreaterThanOrEqual(3);
  });

  it("event multiplies selected base, not the range", () => {
    const base = resolveFixedOrRandomBase({
      rewardType: "fixed",
      fixedPoint: 7,
      randomMin: 3,
      randomMax: 10,
      seed: "x",
    });
    expect(base).toBe(7);
    expect(applyEventMultiplier(7, 2)).toBe(14);
  });

  it("execution key is source identity without boardKey", () => {
    expect(buildCommunityRewardExecutionKey({ targetType: "post", targetId: "p1" })).toBe(
      "community_post:create:p1"
    );
    expect(buildCommunityRewardExecutionKey({ targetType: "comment", targetId: "c1" })).toBe(
      "community_comment:create:c1"
    );
  });
});

describe("T25-T27 policy precedence", () => {
  const global = policy({
    boardKey: COMMUNITY_GLOBAL_BOARD_KEY,
    policyLayer: "global",
    writeFixedPoint: 5,
  });
  const qna = policy({
    boardKey: COMMUNITY_QNA_BOARD_KEY,
    policyLayer: "qna",
    writeRewardType: "random",
    writeFixedPoint: 0,
  });
  const life = policy({
    boardKey: "life",
    policyLayer: "topic",
    inheritGlobal: false,
    writeFixedPoint: 3,
  });
  const inherit = policy({
    boardKey: "travel",
    policyLayer: "topic",
    inheritGlobal: true,
    writeFixedPoint: 99,
  });

  it("T25 topic override wins", () => {
    const r = resolveCommunityPointPolicy({
      topicSlug: "life",
      policies: [global, qna, life],
    });
    expect(r?.source).toBe("topic_override");
    expect(r?.policy.writeFixedPoint).toBe(3);
  });

  it("T26 qna default when no topic override", () => {
    const r = resolveCommunityPointPolicy({
      topicSlug: "travel",
      isQuestion: true,
      policies: [global, qna, inherit],
    });
    expect(r?.source).toBe("qna_default");
    expect(r?.policy.boardKey).toBe("qna");
  });

  it("T27 general fallback", () => {
    const r = resolveCommunityPointPolicy({
      topicSlug: "travel",
      policies: [global, qna, inherit],
    });
    expect(r?.source).toBe("global_default");
    expect(r?.policy.writeFixedPoint).toBe(5);
  });
});

describe("source HARD LOCK greps", () => {
  it("forbids Math.random in community point engine and simulate-core", () => {
    const engine = read("lib/community-points/deterministic-award.ts");
    expect(engine).not.toMatch(/Math\.random\s*\(/);
    const sim = read("lib/point-policies/point-reward-simulate-core.ts");
    expect(sim).not.toMatch(/Math\.random\s*\(/);
    expect(sim).toMatch(/resolveFixedOrRandomBase/);
  });

  it("RPC migration is atomic unique + negative reversal", () => {
    const sql = read("supabase/migrations/20261027120000_community_dpoint_financial_writer.sql");
    expect(sql).toContain("apply_community_point_reward");
    expect(sql).toContain("apply_community_point_reclaim");
    expect(sql).toContain("uq_point_ledger_community_reward_source");
    expect(sql).toContain("uq_point_ledger_community_reclaim_source");
    expect(sql).not.toMatch(/GREATEST\(\s*0,\s*public\.sum_user_point_ledger/);
    expect(sql).toContain("eligibility_lost");
    expect(sql).toContain("admin_remove");
  });

  it("bridge awaits RPC writer, not void credit", () => {
    const bridge = read("lib/points/community-point-bridge.ts");
    expect(bridge).toMatch(/applyCommunityPointReward/);
    expect(bridge).not.toMatch(/executePointRewardServer/);
    expect(bridge).not.toMatch(/voidCommunityPointRewardOnPostWrite/);
  });

  it("does not introduce comment-report or sanction writers", () => {
    const patch = read("app/api/admin/community-reports/[id]/route.ts");
    expect(patch).not.toMatch(/createSanction/i);
    expect(patch).not.toMatch(/banUser/i);
  });

  it("acceptance error messages are user sentences", () => {
    expect(communityAcceptanceErrorMessage("empty")).not.toMatch(/_/);
    expect(communityAcceptanceErrorMessage("punctuation_only")).not.toMatch(/_/);
  });
});
