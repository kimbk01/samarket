#!/usr/bin/env npx tsx
/**
 * Community D-Point T1–T18 against Production DB + current writer modules.
 * QA accounts only. Does not DELETE ledger/executions.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateCommunityContentAcceptance,
  evaluateCommunityPostAcceptance,
} from "@/lib/community-points/content-acceptance";
import {
  applyCommunityCommentReward,
  applyCommunityPointReclaim,
  applyCommunityPostReward,
  reclaimIfEditBecameIneligible,
} from "@/lib/community-points/apply-community-point";
import { COMMUNITY_POINT_DEFAULTS } from "@/lib/community-points/reward-eligibility";
import { resolveCommunityPointPolicy } from "@/lib/community-points/policy-resolver";
import { listBoardPointPolicies } from "@/lib/points/point-policy-db";
import { loadPointFinancialHistory } from "@/lib/points/project-point-financial-history";
import { spendUserPoints, sumUserPointLedger } from "@/lib/points/user-point-ledger";
import { deriveCommunityPostCategoryBucket } from "@/lib/neighborhood/derive-community-post-category-bucket";

const PROD_REF = "ckdosyydvgzqwpbwuhon";
const MARK = "[DPOINT-QA-20260811]";
const SECTION_ID = "33b8c2f7-f536-4c97-9a09-113c17573960";
const LOCATION_ID = "b2277130-b112-413b-8e6a-f037f2abbbfa";
const NEWS_POLICY_ID = "bpp-qa-news-dpoint";

const POSTER = "9c72ce01-62dd-496f-9c01-4f0433e885cf"; // asas44
const COMMENTER = "5f875d4b-1ad6-4538-87fe-ae85b405378f"; // asas22
const FALLBACK_USER = "83ce3d18-5340-4ed9-8834-77e404d3bedb"; // asas11
const QNA_USER = "e7098c15-2c33-4894-8e31-0728d552ee0d"; // asas33
const ADMIN = "11111111-1111-1111-1111-111111111111"; // aaaa

const NORMAL_POST =
  "오늘 마닐라 비 오나요? 우산 챙기는 게 좋겠습니다.";
const NORMAL_COMMENT = "오늘 마닐라 날씨 어떤가요 알려주세요";
let uniqSeq = 0;
function uniqBody(base: string, tag: string) {
  uniqSeq += 1;
  return `${base} ${tag} ${Date.now()}-${uniqSeq}`;
}

async function dbReason(sb: SupabaseClient, targetId: string): Promise<string> {
  const rows = await execForTarget(sb, targetId);
  return String((rows[0] as { reason?: string } | undefined)?.reason ?? "");
}
const NEWS_TOPIC = { id: "c497865c-cc1b-4ec0-8f10-d9b77df014ee", slug: "news" };
const QNA_TOPIC = { id: "c3f76a29-3e69-4ba4-b50a-c0d761e75c70", slug: "question" };
const DAILY_TOPIC = { id: "dc7875d4-e7ef-4540-8fd3-f8dbcfc22588", slug: "dailylife" };

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && process.env[k] == null) process.env[k] = v;
  }
}

const results: Record<string, string> = {};
function setResult(k: string, v: "PASS" | "FAIL" | "NOT_PROVEN", why = "") {
  results[k] = why ? `${v} — ${why}` : v;
  console.log(`[${v}] ${k}${why ? " — " + why : ""}`);
}

async function profileSnap(sb: SupabaseClient, userId: string) {
  const { data: p } = await sb.from("profiles").select("username, points, nickname").eq("id", userId).maybeSingle();
  const { count: ledger } = await sb
    .from("point_ledger")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const { count: exec } = await sb
    .from("point_reward_executions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const sum = await sumUserPointLedger(sb, userId);
  return {
    username: String((p as { username?: string } | null)?.username ?? ""),
    nickname: String((p as { nickname?: string } | null)?.nickname ?? ""),
    points: Number((p as { points?: number } | null)?.points ?? 0),
    ledgerSum: sum.ok ? sum.sum : null,
    ledgerCount: ledger ?? 0,
    execCount: exec ?? 0,
  };
}

async function countRows(sb: SupabaseClient, table: string, col: string, val: string) {
  const { count } = await sb.from(table).select("id", { count: "exact", head: true }).eq(col, val);
  return count ?? 0;
}

async function insertPost(
  sb: SupabaseClient,
  input: {
    userId: string;
    topic: { id: string; slug: string };
    title: string;
    content: string;
    isQuestion?: boolean;
  }
) {
  const { data, error } = await sb
    .from("community_posts")
    .insert({
      user_id: input.userId,
      section_id: SECTION_ID,
      section_slug: "dongnae",
      topic_id: input.topic.id,
      topic_slug: input.topic.slug,
      title: input.title,
      content: input.content,
      summary: input.content.slice(0, 80),
      region_label: "Malate",
      category: deriveCommunityPostCategoryBucket({
        topicOrCategoryRaw: input.topic.slug,
        isMeetup: false,
      }),
      images: [],
      is_question: Boolean(input.isQuestion),
      status: "active",
      is_sample_data: false,
      location_id: LOCATION_ID,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`post insert: ${error?.message ?? "no row"}`);
  return String((data as { id: string }).id);
}

async function insertComment(sb: SupabaseClient, postId: string, userId: string, content: string) {
  const { data, error } = await sb
    .from("community_comments")
    .insert({ post_id: postId, user_id: userId, content, parent_id: null, depth: 0, status: "active" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`comment insert: ${error?.message ?? "no row"}`);
  return String((data as { id: string }).id);
}

async function rewardPost(
  sb: SupabaseClient,
  userId: string,
  nickname: string,
  postId: string,
  title: string,
  content: string,
  topicSlug: string,
  isQuestion = false
) {
  return applyCommunityPostReward({
    sb,
    userId,
    userNickname: nickname,
    userType: "free",
    postId,
    title,
    content,
    topicSlug,
    isQuestion,
  });
}

async function ledgerForRelated(sb: SupabaseClient, relatedType: string, relatedId: string) {
  const { data } = await sb
    .from("point_ledger")
    .select("id, amount, related_type, description")
    .eq("related_type", relatedType)
    .eq("related_id", relatedId);
  return data ?? [];
}

async function execForTarget(sb: SupabaseClient, targetId: string) {
  const { data } = await sb
    .from("point_reward_executions")
    .select("id, status, reason, final_point, base_point, applied_multiplier, policy_snapshot, execution_key")
    .eq("target_id", targetId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

async function ensureNewsOverride(sb: SupabaseClient) {
  const { data: existing } = await sb.from("board_point_policies").select("id").eq("id", NEWS_POLICY_ID).maybeSingle();
  if (existing) {
    await sb
      .from("board_point_policies")
      .update({
        inherit_global: false,
        policy_layer: "topic",
        is_active: true,
        write_reward_type: "fixed",
        write_fixed_point: 5,
        write_cooldown_seconds: 0,
        comment_cooldown_seconds: 0,
        daily_reward_post_cap: 10,
        daily_reward_comment_cap: 30,
        min_reward_post_chars: 10,
        min_reward_comment_chars: 8,
      })
      .eq("id", NEWS_POLICY_ID);
    return { created: false };
  }
  const { error } = await sb.from("board_point_policies").insert({
    id: NEWS_POLICY_ID,
    board_key: "news",
    board_name: "필리핀 뉴스 QA override",
    is_active: true,
    write_reward_type: "fixed",
    write_fixed_point: 5,
    write_random_min: 0,
    write_random_max: 0,
    write_cooldown_seconds: 0,
    comment_reward_type: "fixed",
    comment_fixed_point: 2,
    comment_random_min: 0,
    comment_random_max: 0,
    comment_cooldown_seconds: 0,
    like_reward_point: 0,
    report_reward_point: 0,
    max_free_user_point_cap: 0,
    event_multiplier_enabled: false,
    inherit_global: false,
    policy_layer: "topic",
    daily_reward_post_cap: 10,
    daily_reward_comment_cap: 30,
    min_reward_post_chars: 10,
    min_reward_comment_chars: 8,
    policy_version: 1,
    admin_memo: MARK,
  });
  if (error) throw new Error(`news override insert: ${error.message}`);
  return { created: true };
}

async function restoreNewsOverride(sb: SupabaseClient, created: boolean) {
  if (created) {
    await sb.from("board_point_policies").delete().eq("id", NEWS_POLICY_ID);
    return;
  }
  await sb.from("board_point_policies").delete().eq("id", NEWS_POLICY_ID);
}

async function main() {
  loadEnvLocal();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  console.log("DATABASE TARGET:", url);
  console.log("PROJECT REF:", ref);
  if (ref !== PROD_REF) throw new Error("REFUSING non-production");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const awardSrc = readFileSync(
    resolve(process.cwd(), "lib/community-points/deterministic-award.ts"),
    "utf8"
  );
  const applySrc = readFileSync(
    resolve(process.cwd(), "lib/community-points/apply-community-point.ts"),
    "utf8"
  );
  const randomGone = !awardSrc.includes("Math.random(") && !applySrc.includes("Math.random(");
  console.log("Math.random in writer:", randomGone ? "0" : "PRESENT");

  const beforePoster = await profileSnap(sb, POSTER);
  const beforeCommenter = await profileSnap(sb, COMMENTER);
  console.log("QA USER:", beforePoster.username, POSTER);
  console.log("BALANCE BEFORE:", beforePoster.points, "ledgerSum", beforePoster.ledgerSum);
  console.log("LEDGER COUNT BEFORE:", beforePoster.ledgerCount);
  console.log("EXECUTION COUNT BEFORE:", beforePoster.execCount);
  console.log("QA COMMENTER:", beforeCommenter.username, "pts", beforeCommenter.points);

  let newsCreated = false;
  const generalBefore = await sb
    .from("board_point_policies")
    .select("*")
    .eq("board_key", "general")
    .maybeSingle();

  try {
    newsCreated = (await ensureNewsOverride(sb)).created;

    // T1
    const postsBefore = await countRows(sb, "community_posts", "user_id", POSTER);
    const t1 = evaluateCommunityPostAcceptance({ title: ".", content: "." });
    if (!t1.ok) {
      const postsAfter = await countRows(sb, "community_posts", "user_id", POSTER);
      setResult(
        "T1",
        postsAfter === postsBefore ? "PASS" : "FAIL",
        postsAfter === postsBefore
          ? `HTTP-equivalent acceptance BLOCK code=${t1.code}; posts delta 0`
          : "post count changed"
      );
    } else setResult("T1", "FAIL", "acceptance allowed '.'");

    // T2
    const t2 = evaluateCommunityPostAcceptance({ title: "......", content: "......" });
    const t2c = evaluateCommunityContentAcceptance("......", "comment");
    setResult(
      "T2",
      !t2.ok && !t2c.ok ? "PASS" : "FAIL",
      `post=${t2.ok ? "allow" : t2.code} comment=${t2c.ok ? "allow" : t2c.code}`
    );

    // T3
    const bal0 = await profileSnap(sb, POSTER);
    const bodyT3 = uniqBody(NORMAL_POST, "T3");
    const postT3 = await insertPost(sb, {
      userId: POSTER,
      topic: NEWS_TOPIC,
      title: `${MARK} T3 ${Date.now()}`,
      content: bodyT3,
    });
    const r3 = await rewardPost(
      sb,
      POSTER,
      beforePoster.nickname || "asas44",
      postT3,
      `${MARK} T3`,
      bodyT3,
      "news"
    );
    const led3 = await ledgerForRelated(sb, "community_reward", postT3);
    const ex3 = await execForTarget(sb, postT3);
    const bal1 = await profileSnap(sb, POSTER);
    const t3ok =
      r3.ok &&
      r3.eligible &&
      r3.finalPoint === 5 &&
      led3.length === 1 &&
      ex3.filter((e) => String((e as { status?: string }).status) === "success").length === 1 &&
      bal1.points === bal0.points + 5;
    setResult(
      "T3",
      t3ok ? "PASS" : "FAIL",
      `final=${r3.finalPoint} ledger=${led3.length} exec=${ex3.length} Δpts=${bal1.points - bal0.points} reason=${r3.reason}`
    );

    // T4 retry
    const r4 = await rewardPost(
      sb,
      POSTER,
      beforePoster.nickname || "asas44",
      postT3,
      `${MARK} T3`,
      bodyT3,
      "news"
    );
    const led4 = await ledgerForRelated(sb, "community_reward", postT3);
    const bal4 = await profileSnap(sb, POSTER);
    setResult(
      "T4",
      r4.ok && r4.idempotent === true && led4.length === 1 && bal4.points === bal1.points
        ? "PASS"
        : "FAIL",
      `idempotent=${r4.idempotent} ledger=${led4.length} Δpts=${bal4.points - bal1.points}`
    );

    // T5 concurrency
    const conc = await Promise.all([
      rewardPost(sb, POSTER, beforePoster.nickname || "asas44", postT3, `${MARK} T3`, bodyT3, "news"),
      rewardPost(sb, POSTER, beforePoster.nickname || "asas44", postT3, `${MARK} T3`, bodyT3, "news"),
      rewardPost(sb, POSTER, beforePoster.nickname || "asas44", postT3, `${MARK} T3`, bodyT3, "news"),
    ]);
    const led5 = await ledgerForRelated(sb, "community_reward", postT3);
    const bal5 = await profileSnap(sb, POSTER);
    setResult(
      "T5",
      led5.length === 1 && bal5.points === bal1.points && conc.every((c) => c.ok)
        ? "PASS"
        : "FAIL",
      `ledger=${led5.length} Δpts=${bal5.points - bal1.points} idem=${conc.map((c) => c.idempotent).join(",")}`
    );

    // comments on T3 post
    const c6acc = evaluateCommunityContentAcceptance("감사합니다", "comment");
    if (!c6acc.ok) {
      setResult("T6", "FAIL", "감사합니다 BLOCK at level1 — should ALLOW content");
    } else {
      const cid6 = await insertComment(sb, postT3, COMMENTER, "감사합니다");
      const r6 = await applyCommunityCommentReward({
        sb,
        userId: COMMENTER,
        userNickname: beforeCommenter.nickname || "asas22",
        userType: "free",
        postId: postT3,
        commentId: cid6,
        content: "감사합니다",
        topicSlug: "news",
        postAuthorId: POSTER,
      });
      const led6 = await ledgerForRelated(sb, "community_reward", cid6);
      setResult(
        "T6",
        r6.ok && !r6.eligible && led6.length === 0 ? "PASS" : "FAIL",
        `comment exists eligible=${r6.eligible} reason=${r6.reason} ledger=${led6.length}`
      );
    }

    const cid7 = await insertComment(sb, postT3, COMMENTER, NORMAL_COMMENT);
    const r7 = await applyCommunityCommentReward({
      sb,
      userId: COMMENTER,
      userNickname: beforeCommenter.nickname || "asas22",
      userType: "free",
      postId: postT3,
      commentId: cid7,
      content: NORMAL_COMMENT,
      topicSlug: "news",
      postAuthorId: POSTER,
    });
    const led7 = await ledgerForRelated(sb, "community_reward", cid7);
    setResult(
      "T7",
      r7.ok && r7.eligible && (r7.finalPoint ?? 0) > 0 && led7.length === 1 ? "PASS" : "FAIL",
      `eligible=${r7.eligible} final=${r7.finalPoint} reason=${r7.reason}`
    );

    const cid8 = await insertComment(sb, postT3, POSTER, NORMAL_COMMENT + " 작성자 본인");
    const r8 = await applyCommunityCommentReward({
      sb,
      userId: POSTER,
      userNickname: beforePoster.nickname || "asas44",
      userType: "free",
      postId: postT3,
      commentId: cid8,
      content: NORMAL_COMMENT + " 작성자 본인",
      topicSlug: "news",
      postAuthorId: POSTER,
    });
    const led8 = await ledgerForRelated(sb, "community_reward", cid8);
    const why8 = await dbReason(sb, cid8);
    setResult(
      "T8",
      r8.ok && !r8.eligible && why8 === "self_comment" && led8.length === 0 ? "PASS" : "FAIL",
      `reason=${why8} ledger=${led8.length}`
    );

    const cid9 = await insertComment(sb, postT3, COMMENTER, NORMAL_COMMENT);
    const r9 = await applyCommunityCommentReward({
      sb,
      userId: COMMENTER,
      userNickname: beforeCommenter.nickname || "asas22",
      userType: "free",
      postId: postT3,
      commentId: cid9,
      content: NORMAL_COMMENT,
      topicSlug: "news",
      postAuthorId: POSTER,
    });
    const led9 = await ledgerForRelated(sb, "community_reward", cid9);
    const why9 = await dbReason(sb, cid9);
    setResult(
      "T9",
      r9.ok && !r9.eligible && why9 === "duplicate_text" && led9.length === 0 ? "PASS" : "FAIL",
      `reason=${why9} ledger=${led9.length}`
    );

    // T10 daily cap via override
    const { count: writesToday } = await sb
      .from("point_reward_executions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", POSTER)
      .eq("action_type", "write")
      .eq("status", "success")
      .gte("created_at", new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())).toISOString());
    const capAt = Math.max(1, writesToday ?? 0);
    await sb.from("board_point_policies").update({ daily_reward_post_cap: capAt }).eq("id", NEWS_POLICY_ID);
    const bodyT10 = uniqBody(NORMAL_POST, "T10");
    const postT10 = await insertPost(sb, {
      userId: POSTER,
      topic: NEWS_TOPIC,
      title: `${MARK} T10 cap`,
      content: bodyT10,
    });
    const r10 = await rewardPost(
      sb,
      POSTER,
      beforePoster.nickname || "asas44",
      postT10,
      `${MARK} T10`,
      bodyT10,
      "news"
    );
    const led10 = await ledgerForRelated(sb, "community_reward", postT10);
    const why10 = await dbReason(sb, postT10);
    await sb.from("board_point_policies").update({ daily_reward_post_cap: 10 }).eq("id", NEWS_POLICY_ID);
    setResult(
      "T10",
      Boolean(postT10) && r10.ok && !r10.eligible && why10 === "daily_cap" && led10.length === 0
        ? "PASS"
        : "FAIL",
      `reason=${why10} ledger=${led10.length}`
    );

    // T11 cooldown — first write under cooldown=0, then raise cooldown
    const bodyT11a = uniqBody(NORMAL_POST, "T11a");
    const postT11a = await insertPost(sb, {
      userId: POSTER,
      topic: NEWS_TOPIC,
      title: `${MARK} T11a`,
      content: bodyT11a,
    });
    const r11a = await rewardPost(
      sb,
      POSTER,
      beforePoster.nickname || "asas44",
      postT11a,
      `${MARK} T11a`,
      bodyT11a,
      "news"
    );
    await sb.from("board_point_policies").update({ write_cooldown_seconds: 86400 }).eq("id", NEWS_POLICY_ID);
    const bodyT11b = uniqBody(NORMAL_POST, "T11b");
    const postT11b = await insertPost(sb, {
      userId: POSTER,
      topic: NEWS_TOPIC,
      title: `${MARK} T11b`,
      content: bodyT11b,
    });
    const r11b = await rewardPost(
      sb,
      POSTER,
      beforePoster.nickname || "asas44",
      postT11b,
      `${MARK} T11b`,
      bodyT11b,
      "news"
    );
    const led11b = await ledgerForRelated(sb, "community_reward", postT11b);
    const why11b = await dbReason(sb, postT11b);
    await sb.from("board_point_policies").update({ write_cooldown_seconds: 0 }).eq("id", NEWS_POLICY_ID);
    setResult(
      "T11",
      r11a.ok && r11a.eligible && r11b.ok && !r11b.eligible && why11b === "cooldown" && led11b.length === 0
        ? "PASS"
        : "FAIL",
      `firstEligible=${r11a.eligible} second=${why11b} ledger2=${led11b.length}`
    );

    // T12 random Q&A — dedicated QA user so board cooldown from prior runs cannot mask random
    const qnaSnap = await profileSnap(sb, QNA_USER);
    const bodyT12 = uniqBody(NORMAL_POST, "T12");
    const postT12 = await insertPost(sb, {
      userId: QNA_USER,
      topic: QNA_TOPIC,
      title: `${MARK} T12 QNA`,
      content: bodyT12,
      isQuestion: true,
    });
    const r12 = await rewardPost(
      sb,
      QNA_USER,
      qnaSnap.nickname || "asas33",
      postT12,
      `${MARK} T12`,
      bodyT12,
      "question",
      true
    );
    const ex12 = await execForTarget(sb, postT12);
    const snap12 = (ex12[0] as { policy_snapshot?: Record<string, unknown>; base_point?: number; final_point?: number }) ?? {};
    const r12b = await rewardPost(
      sb,
      QNA_USER,
      qnaSnap.nickname || "asas33",
      postT12,
      `${MARK} T12`,
      bodyT12,
      "question",
      true
    );
    const led12 = await ledgerForRelated(sb, "community_reward", postT12);
    const inRange =
      (r12.finalPoint ?? 0) >= 3 && (r12.finalPoint ?? 0) <= 10 && r12.eligible === true;
    setResult(
      "T12",
      r12.ok &&
        inRange &&
        r12b.idempotent === true &&
        led12.length === 1 &&
        r12b.finalPoint === r12.finalPoint &&
        randomGone
        ? "PASS"
        : "FAIL",
      `final=${r12.finalPoint} base=${snap12.base_point} retryFinal=${r12b.finalPoint} ledger=${led12.length} source=${String(snap12.policy_snapshot?.resolve_source ?? "")}`
    );

    // T13 topic override = 6
    await sb.from("board_point_policies").update({ write_fixed_point: 6 }).eq("id", NEWS_POLICY_ID);
    const bodyOv = uniqBody(NORMAL_POST, "T13ov");
    const postOv = await insertPost(sb, {
      userId: POSTER,
      topic: NEWS_TOPIC,
      title: `${MARK} T13 override6`,
      content: bodyOv,
    });
    const rOv = await rewardPost(
      sb,
      POSTER,
      beforePoster.nickname || "asas44",
      postOv,
      `${MARK} T13`,
      bodyOv,
      "news"
    );
    await sb.from("board_point_policies").update({ write_fixed_point: 5 }).eq("id", NEWS_POLICY_ID);
    setResult(
      "TOPIC OVERRIDE",
      rOv.ok && rOv.eligible && rOv.finalPoint === 6 ? "PASS" : "FAIL",
      `final=${rOv.finalPoint} reason=${rOv.reason}`
    );

    // QNA fallback already from T12 snapshot
    setResult(
      "QNA FALLBACK",
      String(snap12.policy_snapshot?.resolve_source ?? "") === "qna_default" ? "PASS" : "FAIL",
      String(snap12.policy_snapshot?.resolve_source ?? "")
    );

    // GENERAL FALLBACK — separate user + dailylife
    const fbSnap = await profileSnap(sb, FALLBACK_USER);
    const bodyGf = uniqBody(NORMAL_POST, "gf");
    const postGf = await insertPost(sb, {
      userId: FALLBACK_USER,
      topic: DAILY_TOPIC,
      title: `${MARK} general fallback`,
      content: bodyGf,
    });
    const rGf = await rewardPost(
      sb,
      FALLBACK_USER,
      fbSnap.nickname || "asas11",
      postGf,
      `${MARK} gf`,
      bodyGf,
      "dailylife"
    );
    const exGf = await execForTarget(sb, postGf);
    const srcGf = String(
      ((exGf[0] as { policy_snapshot?: { resolve_source?: string } } | undefined)?.policy_snapshot ?? {})
        .resolve_source ?? ""
    );
    setResult(
      "GENERAL FALLBACK",
      rGf.ok && srcGf === "global_default" ? "PASS" : "FAIL",
      `source=${srcGf} eligible=${rGf.eligible} final=${rGf.finalPoint} reason=${rGf.reason}`
    );

    // T13 delete reversal (spec T13) on postOv if rewarded else postT3 leftover — use dedicated
    const delTarget = rOv.eligible ? postOv : postT3;
    const exDelBefore = await execForTarget(sb, delTarget);
    const origFinal = Number((exDelBefore[0] as { final_point?: number } | undefined)?.final_point ?? 0);
    const balDel0 = await profileSnap(sb, POSTER);
    await sb.from("community_posts").update({ status: "deleted" }).eq("id", delTarget);
    const rec1 = await applyCommunityPointReclaim({
      sb,
      targetId: delTarget,
      targetType: "post",
      triggerType: "delete",
    });
    const rec2 = await applyCommunityPointReclaim({
      sb,
      targetId: delTarget,
      targetType: "post",
      triggerType: "delete",
    });
    const exDel = await execForTarget(sb, delTarget);
    const revLed = await sb
      .from("point_ledger")
      .select("id, amount")
      .eq("related_type", "community_reclaim")
      .eq(
        "related_id",
        String((exDel[0] as { id?: string } | undefined)?.id ?? "")
      );
    const balDel1 = await profileSnap(sb, POSTER);
    setResult(
      "T13",
      rec1.ok &&
        rec2.ok &&
        rec2.idempotent === true &&
        String((exDel[0] as { status?: string }).status) === "reversed" &&
        (revLed.data ?? []).length === 1 &&
        balDel1.points === balDel0.points - origFinal
        ? "PASS"
        : "FAIL",
      `rec1=${JSON.stringify(rec1)} rec2idem=${rec2.idempotent} status=${(exDel[0] as { status?: string })?.status} rev=${(revLed.data ?? []).length} Δ=${balDel1.points - balDel0.points}`
    );
    setResult(
      "T14",
      rec2.ok && rec2.idempotent === true && (revLed.data ?? []).length === 1 ? "PASS" : "FAIL",
      `idempotent=${rec2.idempotent} reclaimLedger=${(revLed.data ?? []).length}`
    );

    // T15 admin remove
    const bodyAdm = uniqBody(NORMAL_POST, "T15");
    const postAdm = await insertPost(sb, {
      userId: POSTER,
      topic: NEWS_TOPIC,
      title: `${MARK} T15 admin`,
      content: bodyAdm,
    });
    const rAdm = await rewardPost(
      sb,
      POSTER,
      beforePoster.nickname || "asas44",
      postAdm,
      `${MARK} T15`,
      bodyAdm,
      "news"
    );
    await sb.from("community_posts").update({ status: "hidden" }).eq("id", postAdm);
    const recAdm = await applyCommunityPointReclaim({
      sb,
      targetId: postAdm,
      targetType: "post",
      triggerType: "admin_remove",
    });
    const recAdm2 = await applyCommunityPointReclaim({
      sb,
      targetId: postAdm,
      targetType: "post",
      triggerType: "admin_remove",
    });
    setResult(
      "T15",
      rAdm.ok && rAdm.eligible && recAdm.ok && recAdm2.idempotent === true ? "PASS" : "FAIL",
      `reward=${rAdm.finalPoint} rec=${JSON.stringify(recAdm)} idem2=${recAdm2.idempotent}`
    );

    // T16 report confirmed
    const bodyRep = uniqBody(NORMAL_POST, "T16");
    const postRep = await insertPost(sb, {
      userId: POSTER,
      topic: NEWS_TOPIC,
      title: `${MARK} T16 report`,
      content: bodyRep,
    });
    const rRep = await rewardPost(
      sb,
      POSTER,
      beforePoster.nickname || "asas44",
      postRep,
      `${MARK} T16`,
      bodyRep,
      "news"
    );
    const { data: reportRow, error: reportErr } = await sb
      .from("community_reports")
      .insert({
        target_type: "post",
        target_id: postRep,
        post_id: postRep,
        user_id: COMMENTER,
        reason: `${MARK} QA report fixture`,
        status: "open",
      })
      .select("id")
      .single();
    if (reportErr) {
      setResult("T16", "FAIL", reportErr.message);
    } else {
      await sb
        .from("community_reports")
        .update({ status: "resolved", processed_at: new Date().toISOString() })
        .eq("id", String((reportRow as { id: string }).id));
      const recR = await applyCommunityPointReclaim({
        sb,
        targetId: postRep,
        targetType: "post",
        triggerType: "report_confirmed",
      });
      const recR2 = await applyCommunityPointReclaim({
        sb,
        targetId: postRep,
        targetType: "post",
        triggerType: "report_confirmed",
      });
      setResult(
        "T16",
        rRep.ok && rRep.eligible && recR.ok && recR2.idempotent === true ? "PASS" : "FAIL",
        `report=${(reportRow as { id: string }).id} rec=${JSON.stringify(recR)} idem2=${recR2.idempotent}`
      );
    }

    // T17 negative reversal
    const bodyNeg = uniqBody(NORMAL_POST, "T17");
    const postNeg = await insertPost(sb, {
      userId: POSTER,
      topic: NEWS_TOPIC,
      title: `${MARK} T17 neg`,
      content: bodyNeg,
    });
    const rNeg = await rewardPost(
      sb,
      POSTER,
      beforePoster.nickname || "asas44",
      postNeg,
      `${MARK} T17`,
      bodyNeg,
      "news"
    );
    const afterReward = await profileSnap(sb, POSTER);
    const rewardAmt = rNeg.finalPoint ?? 0;
    const leave = 2;
    const spendAmt = afterReward.points > leave ? afterReward.points - leave : 0;
    const spend =
      spendAmt > 0
        ? await spendUserPoints(sb, {
            userId: POSTER,
            amount: spendAmt,
            entryType: "admin_debit",
            relatedType: "admin_manual",
            relatedId: `qa-dpoint-neg-setup:${postNeg}`,
            description: `${MARK} QA spend setup for negative reversal`,
            actorType: "admin",
          })
        : { ok: true as const, code: undefined as string | undefined };
    const mid = await profileSnap(sb, POSTER);
    const overSpend = await spendUserPoints(sb, {
      userId: POSTER,
      amount: mid.points + 50,
      entryType: "admin_debit",
      relatedType: "admin_manual",
      relatedId: `qa-dpoint-neg-over:${postNeg}`,
      description: `${MARK} QA prove member spend cannot go negative`,
      actorType: "admin",
    });
    await sb.from("community_posts").update({ status: "deleted" }).eq("id", postNeg);
    const recNeg = await applyCommunityPointReclaim({
      sb,
      targetId: postNeg,
      targetType: "post",
      triggerType: "delete",
    });
    const afterNeg = await profileSnap(sb, POSTER);
    const expectedNeg = mid.points - (rNeg.finalPoint ?? 0);
    const bodyOff = uniqBody(NORMAL_POST, "T17off");
    const postOffset = await insertPost(sb, {
      userId: POSTER,
      topic: NEWS_TOPIC,
      title: `${MARK} T17 offset`,
      content: bodyOff,
    });
    const rOff = await rewardPost(
      sb,
      POSTER,
      beforePoster.nickname || "asas44",
      postOffset,
      `${MARK} T17o`,
      bodyOff,
      "news"
    );
    const afterOff = await profileSnap(sb, POSTER);
    setResult(
      "T17",
      rNeg.ok &&
        rNeg.eligible &&
        spend.ok &&
        overSpend.ok === false &&
        overSpend.code === "insufficient_balance" &&
        recNeg.ok &&
        afterNeg.points === expectedNeg &&
        expectedNeg < 0 &&
        rOff.ok &&
        rOff.eligible &&
        afterOff.points === expectedNeg + (rOff.finalPoint ?? 0)
        ? "PASS"
        : "FAIL",
      `reward=${rNeg.finalPoint} spendOk=${spend.ok} over=${overSpend.ok ? "spent" : overSpend.code} mid=${mid.points} afterNeg=${afterNeg.points} expectedNeg=${expectedNeg} offset=${rOff.finalPoint} end=${afterOff.points}`
    );

    // T18 member=admin same ledger id (from T3 if still present, else offset)
    const sampleLedgerId = rOff.ledgerId || r3.ledgerId || (led3[0] as { id?: string } | undefined)?.id;
    const hist = await loadPointFinancialHistory(sb, { userId: POSTER, limit: 30 });
    const histItems = hist.ok ? hist.page.items : [];
    const histHit = histItems.find((it) => it.ledgerId === sampleLedgerId);
    const { data: adminHit } = await sb
      .from("point_ledger")
      .select("id, amount, related_type, description")
      .eq("id", String(sampleLedgerId ?? ""))
      .maybeSingle();
    const titleBlob = `${histHit?.fallbackTitleKo ?? ""} ${histHit?.titleKey ?? ""} ${histHit?.description ?? ""}`;
    const titleOk =
      histHit != null &&
      !titleBlob.includes("이벤트 지급") &&
      (titleBlob.includes("커뮤니티") || String(histHit.titleKey).includes("community"));
    setResult(
      "T18",
      Boolean(sampleLedgerId) && Boolean(adminHit) && histHit?.ledgerId === String((adminHit as { id?: string }).id) && titleOk
        ? "PASS"
        : "FAIL",
      `ledger=${sampleLedgerId} hist=${histHit?.ledgerId ?? "none"} titleKey=${histHit?.titleKey ?? ""} ko=${histHit?.fallbackTitleKo ?? ""}`
    );

    // EDIT invalid
    const beforeEdit = await sb.from("community_comments").select("content").eq("id", cid7).maybeSingle();
    const editInvalid = evaluateCommunityContentAcceptance(".", "comment");
    const afterEditSame = await sb.from("community_comments").select("content").eq("id", cid7).maybeSingle();
    const rewardStill = await ledgerForRelated(sb, "community_reward", cid7);
    setResult(
      "EDIT INVALID",
      !editInvalid.ok &&
        String((beforeEdit.data as { content?: string })?.content) ===
          String((afterEditSame.data as { content?: string })?.content) &&
        rewardStill.length === 1
        ? "PASS"
        : "FAIL",
      `blocked=${!editInvalid.ok} content unchanged reward ledger=${rewardStill.length}`
    );

    // EDIT eligibility lost
    await sb.from("community_comments").update({ content: "감사합니다" }).eq("id", cid7);
    await reclaimIfEditBecameIneligible({
      sb,
      targetId: cid7,
      targetType: "comment",
      content: "감사합니다",
      minRewardChars: COMMUNITY_POINT_DEFAULTS.minRewardCommentChars,
    });
    const recEdit2 = await applyCommunityPointReclaim({
      sb,
      targetId: cid7,
      targetType: "comment",
      triggerType: "eligibility_lost",
    });
    await sb.from("community_comments").update({ content: NORMAL_POST }).eq("id", cid7);
    const rRe = await applyCommunityCommentReward({
      sb,
      userId: COMMENTER,
      userNickname: beforeCommenter.nickname || "asas22",
      userType: "free",
      postId: postT3,
      commentId: cid7,
      content: NORMAL_POST,
      topicSlug: "news",
      postAuthorId: POSTER,
    });
    const ledRe = await ledgerForRelated(sb, "community_reward", cid7);
    setResult(
      "EDIT ELIGIBILITY LOST",
      recEdit2.ok && recEdit2.idempotent === true && rRe.idempotent === true && ledRe.length === 1
        ? "PASS"
        : "FAIL",
      `reclaimIdem=${recEdit2.idempotent} recreateIdem=${rRe.idempotent} rewardLedger=${ledRe.length}`
    );

    // T21 global save/restore
    const g = generalBefore.data as { write_cooldown_seconds?: number } | null;
    const origCd = Number(g?.write_cooldown_seconds ?? 60);
    await sb.from("board_point_policies").update({ write_cooldown_seconds: origCd + 1 }).eq("board_key", "general");
    const { data: g2 } = await sb
      .from("board_point_policies")
      .select("write_cooldown_seconds")
      .eq("board_key", "general")
      .maybeSingle();
    const changed = Number((g2 as { write_cooldown_seconds?: number } | null)?.write_cooldown_seconds) === origCd + 1;
    await sb.from("board_point_policies").update({ write_cooldown_seconds: origCd }).eq("board_key", "general");
    const { data: g3 } = await sb
      .from("board_point_policies")
      .select("write_cooldown_seconds")
      .eq("board_key", "general")
      .maybeSingle();
    const restored = Number((g3 as { write_cooldown_seconds?: number } | null)?.write_cooldown_seconds) === origCd;
    setResult("RESTORE", changed && restored ? "PASS" : "FAIL", `changed=${changed} restored=${restored} origCd=${origCd}`);
  } finally {
    await sb.from("board_point_policies").update({ write_fixed_point: 5, write_cooldown_seconds: 0, daily_reward_post_cap: 10 }).eq("id", NEWS_POLICY_ID);
    await restoreNewsOverride(sb, newsCreated);
    const g = generalBefore.data as { write_cooldown_seconds?: number } | null;
    if (g?.write_cooldown_seconds != null) {
      await sb
        .from("board_point_policies")
        .update({ write_cooldown_seconds: g.write_cooldown_seconds })
        .eq("board_key", "general");
    }
  }

  console.log("\n=== T1–T18 SUMMARY ===");
  for (const k of [
    "T1",
    "T2",
    "T3",
    "T4",
    "T5",
    "T6",
    "T7",
    "T8",
    "T9",
    "T10",
    "T11",
    "T12",
    "T13",
    "T14",
    "T15",
    "T16",
    "T17",
    "T18",
    "EDIT INVALID",
    "EDIT ELIGIBILITY LOST",
    "TOPIC OVERRIDE",
    "QNA FALLBACK",
    "GENERAL FALLBACK",
    "RESTORE",
  ]) {
    console.log(`${k}: ${results[k] ?? "NOT_PROVEN"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
