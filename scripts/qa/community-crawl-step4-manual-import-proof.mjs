/**
 * STEP4 Manual Import (REFERENCE_SUMMARY) proof.
 * Applies STEP4 migration via psql, imports 1 QA post with DIBAY-written body,
 * proves deltas / duplicate / attribution / origin / no point reward / no media.
 *
 * COMMIT/PUSH: NO
 * Usage: node --env-file=.env.local scripts/qa/community-crawl-step4-manual-import-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const EXPECTED_HOST_FRAGMENT = "ckdosyydvgzqwpbwuhon";
const STEP4 = {
  file: "20261219120000_community_crawl_manual_import_reference_summary.sql",
  version: "20261219120000",
};
const SOURCE_ID = "b221b18e-5655-4a48-91e5-ce4ce9d32f2b";
const BOARD_ID = "3ff35075-c7af-46bd-805b-a0cf210223cf";
const TOPIC_ID = "e0914e34-e44c-42f7-adcc-8f6cf8c7843a";
const PSQL = process.env.STEP4_PSQL || "/opt/homebrew/bin/psql";
const ARTIFACT = resolve(
  process.cwd(),
  "tests/e2e/.artifacts/community-crawl-step4-manual-import-close.json"
);

const report = {
  step: "STEP4_MANUAL_IMPORT_CLOSE",
  ok: false,
  startedAt: new Date().toISOString(),
  checks: {},
  errors: [],
  finishedAt: null,
};

function loadEnvLocal() {
  try {
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
  } catch {
    /* ignore */
  }
}

function buildConnectionString() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!pass) return null;
  const pooler =
    process.env.SUPABASE_POOLER_URL?.trim() ||
    "postgresql://postgres.ckdosyydvgzqwpbwuhon@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";
  const u = new URL(pooler.replace(/^postgresql:\/\//, "http://"));
  u.password = encodeURIComponent(pass);
  if (!u.username) u.username = "postgres.ckdosyydvgzqwpbwuhon";
  return `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}

function setCheck(key, pass, detail) {
  report.checks[key] = { pass: !!pass, detail: detail ?? null };
  if (!pass) report.errors.push(`${key}: ${detail ?? "FAIL"}`);
}

function psql(conn, args, input) {
  return execFileSync(PSQL, ["--dbname", conn, "-v", "ON_ERROR_STOP=1", ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function countExact(sb, table) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0, error: null };
}

async function main() {
  loadEnvLocal();
  mkdirSync(resolve(process.cwd(), "tests/e2e/.artifacts"), { recursive: true });

  const conn = buildConnectionString();
  if (!conn) throw new Error("no DATABASE_URL / SUPABASE_DB_PASSWORD");
  if (!conn.includes(EXPECTED_HOST_FRAGMENT)) throw new Error("host fragment mismatch");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("missing supabase env");
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const have = psql(
    conn,
    ["-At", "-c", `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${STEP4.version}'`]
  ).trim();
  if (!have) {
    const sqlPath = resolve(process.cwd(), "supabase/migrations", STEP4.file);
    psql(conn, ["-f", sqlPath]);
    psql(
      conn,
      [
        "-c",
        `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${STEP4.version}') ON CONFLICT DO NOTHING`,
      ]
    );
    setCheck("DB_APPLY", true, "STEP4 migration applied");
  } else {
    setCheck("DB_APPLY", true, "STEP4 migration already present");
  }

  const { data: source } = await sb
    .from("community_crawl_sources")
    .select("id,name,policy_status,publish_mode")
    .eq("id", SOURCE_ID)
    .maybeSingle();
  setCheck(
    "SOURCE_POLICY",
    source?.policy_status === "REVIEW_REQUIRED" && source?.publish_mode === "REFERENCE_SUMMARY",
    JSON.stringify(source)
  );

  const { data: board } = await sb
    .from("community_crawl_boards")
    .select("id,dibay_topic_id,source_id")
    .eq("id", BOARD_ID)
    .maybeSingle();
  setCheck("BOARD_TOPIC", board?.dibay_topic_id === TOPIC_ID, JSON.stringify(board));

  const { data: topic } = await sb
    .from("community_topics")
    .select("id,slug,section_id,name")
    .eq("id", TOPIC_ID)
    .single();
  const { data: section } = await sb
    .from("community_sections")
    .select("id,slug")
    .eq("id", topic.section_id)
    .single();
  const { data: principal } = await sb.from("community_import_principal").select("user_id").maybeSingle();
  setCheck("PRINCIPAL_ROW", !!principal?.user_id, JSON.stringify(principal));

  const beforePosts = await countExact(sb, "community_posts");
  const beforeLinks = await countExact(sb, "community_crawl_post_links");
  const beforeImages = await countExact(sb, "community_post_images");

  const qaKey = randomUUID().slice(0, 8);
  const qaUrl = `https://app.philippines.travel/articles/step4-qa-${qaKey}`;
  const sourcePostId = `step4-qa-${qaKey}`;
  const dibayTitle = `[STEP4 QA] 필리핀 여행정보 수동 게시 검증 ${qaKey}`;
  const dibayBody =
    "이 글은 Travel Philippines 원문을 참고해 DIBAY가 직접 정리한 여행정보입니다. 세부·보라카이 방문 전 교통·날씨·안전 팁을 확인하세요. 원문 전문은 복제하지 않았습니다.";

  const payload = {
    board_id: BOARD_ID,
    source_post_id: sourcePostId,
    canonical_url: qaUrl,
    source_published_at: "2026-03-01T00:00:00.000Z",
    principal_user_id: principal.user_id,
    section_id: section.id,
    section_slug: section.slug,
    topic_id: topic.id,
    topic_slug: topic.slug,
    title: dibayTitle,
    content: dibayBody,
    summary: dibayBody.slice(0, 160),
    region_label: "필리핀",
    category: "etc",
    display_author_name: "Travel Philippines",
    display_author_avatar_url: null,
    created_at: new Date().toISOString(),
    view_count: 17,
  };

  const { data: firstRaw, error: firstErr } = await sb.rpc(
    "community_crawl_manual_import_reference_summary",
    { p_payload: payload }
  );
  const first = firstRaw && typeof firstRaw === "object" ? firstRaw : {};
  setCheck("FIRST_IMPORT_RPC", !firstErr && first.ok === true, JSON.stringify({ firstErr, first }));
  if (firstErr || first.ok !== true) {
    report.finishedAt = new Date().toISOString();
    writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const postId = String(first.community_post_id);
  const linkId = String(first.post_link_id);

  const afterPosts = await countExact(sb, "community_posts");
  const afterLinks = await countExact(sb, "community_crawl_post_links");
  const afterImages = await countExact(sb, "community_post_images");
  setCheck(
    "COMMUNITY_POSTS_DELTA",
    beforePosts.count != null && afterPosts.count === beforePosts.count + 1,
    `before=${beforePosts.count} after=${afterPosts.count}`
  );
  setCheck(
    "POST_LINK_DELTA",
    beforeLinks.count != null && afterLinks.count === beforeLinks.count + 1,
    `before=${beforeLinks.count} after=${afterLinks.count}`
  );
  setCheck(
    "MEDIA_DELTA",
    beforeImages.count != null && afterImages.count === beforeImages.count,
    `before=${beforeImages.count} after=${afterImages.count}`
  );
  setCheck("POINT_REWARD", Number(first.point_reward) === 0, String(first.point_reward));
  setCheck("ORIGIN_KIND_RPC", first.origin_kind === "imported", String(first.origin_kind));

  const { data: post } = await sb
    .from("community_posts")
    .select(
      "id,title,content,origin_kind,display_author_name,user_id,view_count,topic_slug,created_at"
    )
    .eq("id", postId)
    .maybeSingle();
  setCheck(
    "CONTENT_SEPARATION",
    !!post &&
      post.content === dibayBody &&
      !String(post.content).includes("FULL EXTERNAL DOT BODY") &&
      post.title === dibayTitle &&
      post.origin_kind === "imported",
    JSON.stringify({ title: post?.title, contentHead: String(post?.content ?? "").slice(0, 80) })
  );
  setCheck("TOPIC", post?.topic_slug === "travel", post?.topic_slug);
  setCheck("AUTHOR", post?.display_author_name === "Travel Philippines", post?.display_author_name);
  setCheck("VIEW_SEED", Number(post?.view_count) === 17, String(post?.view_count));
  setCheck("PRINCIPAL", post?.user_id === principal.user_id, post?.user_id);

  const { data: link } = await sb
    .from("community_crawl_post_links")
    .select("id,canonical_url,community_post_id,manual_override,source_post_id")
    .eq("id", linkId)
    .maybeSingle();
  setCheck(
    "LINK_ATTR",
    link?.canonical_url === qaUrl &&
      link?.community_post_id === postId &&
      link?.manual_override === true &&
      link?.source_post_id === sourcePostId,
    JSON.stringify(link)
  );

  const { data: sourceRow } = await sb
    .from("community_crawl_sources")
    .select("name")
    .eq("id", SOURCE_ID)
    .maybeSingle();
  setCheck(
    "SOURCE_ATTRIBUTION",
    String(sourceRow?.name ?? "").includes("Travel Philippines") && link?.canonical_url === qaUrl,
    JSON.stringify({ sourceName: sourceRow?.name, url: link?.canonical_url })
  );

  const { data: dupRaw, error: dupErr } = await sb.rpc("community_crawl_manual_import_reference_summary", {
    p_payload: {
      ...payload,
      title: dibayTitle + " retry",
      content: dibayBody + " retry body for duplicate attempt that must fail.",
      view_count: 99,
    },
  });
  const dup = dupRaw && typeof dupRaw === "object" ? dupRaw : {};
  const afterDupPosts = await countExact(sb, "community_posts");
  const afterDupLinks = await countExact(sb, "community_crawl_post_links");
  setCheck(
    "DUPLICATE_REJECT",
    !dupErr && dup.ok === false && dup.error === "already_imported",
    JSON.stringify({ dupErr, dup })
  );
  setCheck(
    "DUPLICATE_POST_DELTA",
    afterDupPosts.count === afterPosts.count,
    `afterFirst=${afterPosts.count} afterDup=${afterDupPosts.count}`
  );
  setCheck(
    "DUPLICATE_LINK_DELTA",
    afterDupLinks.count === afterLinks.count,
    `afterFirst=${afterLinks.count} afterDup=${afterDupLinks.count}`
  );

  const writerSrc = readFileSync(
    resolve(process.cwd(), "lib/community-crawler/manual-import-writer.ts"),
    "utf8"
  );
  setCheck("WRITER_NO_POINT", !/applyCommunityPointRewardOnPostWrite\s*\(/.test(writerSrc), "writer static");

  const uiSrc = readFileSync(
    resolve(process.cwd(), "components/admin/community/AdminCommunityExternalSourcesPage.tsx"),
    "utf8"
  );
  setCheck(
    "IMPORT_EDITOR_UI",
    uiSrc.includes("admin_community_crawl_write_dibay_post") &&
      uiSrc.includes("submitImportPublish") &&
      uiSrc.includes("admin_community_crawl_import_source_ref"),
    "admin editor CTA"
  );

  const { data: policyAfter } = await sb
    .from("community_crawl_sources")
    .select("policy_status,publish_mode")
    .eq("id", SOURCE_ID)
    .maybeSingle();
  setCheck(
    "POLICY_STILL_REVIEW",
    policyAfter?.policy_status === "REVIEW_REQUIRED" &&
      policyAfter?.publish_mode === "REFERENCE_SUMMARY",
    JSON.stringify(policyAfter)
  );

  report.ok = report.errors.length === 0;
  report.finishedAt = new Date().toISOString();
  report.communityPostId = postId;
  report.canonicalUrl = qaUrl;
  report.philifePath = `/philife/${postId}`;
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  report.ok = false;
  report.errors.push(String(e?.stack || e));
  report.finishedAt = new Date().toISOString();
  try {
    writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  } catch {
    /* */
  }
  console.error(e);
  process.exit(1);
});
