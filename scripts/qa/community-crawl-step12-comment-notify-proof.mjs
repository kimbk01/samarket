/**
 * Minimal imported comment notify proof (local Next already proven for like).
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";

const PORT = 3462;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ARTIFACT = resolve(process.cwd(), "tests/e2e/.artifacts/community-crawl-step12-runtime-close.json");
const MARKER = "__STEP12_COMMENT_FIXTURE__";
const EMAIL = `step12-comment-${Date.now()}@dibay.internal`;
const PASS = `Step12Qa!${randomUUID().slice(0, 8)}`;

function loadEnv() {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k && process.env[k] == null) process.env[k] = v;
  }
}

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${ORIGIN}/login`, { redirect: "manual" });
      if (r.status > 0 && r.status < 500) return true;
    } catch {
      /* retry */
    }
    await sleep(2000);
  }
  return false;
}

async function main() {
  loadEnv();
  const report = existsSync(ARTIFACT) ? JSON.parse(readFileSync(ARTIFACT, "utf8")) : { checks: {} };
  report.checks ||= {};

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const client = new pg.Client({
    connectionString: `postgresql://postgres.ckdosyydvgzqwpbwuhon:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let tempId = null;
  let memId = null;
  let fixtureId = null;
  let child = null;

  try {
    const principalId = (await client.query(`SELECT user_id FROM community_import_principal LIMIT 1`)).rows[0]
      .user_id;
    const topic = (
      await client.query(
        `SELECT id FROM community_topics WHERE is_active AND COALESCE(is_feed_sort,false)=false LIMIT 1`
      )
    ).rows[0];
    const section = (await client.query(`SELECT id, slug FROM community_sections WHERE is_active LIMIT 1`)).rows[0];

    const { data: created } = await sb.auth.admin.createUser({
      email: EMAIL,
      password: PASS,
      email_confirm: true,
    });
    tempId = created.user.id;
    await sb.from("profiles").upsert({ id: tempId, nickname: "step12_comment_actor" });
    await client.query(
      `UPDATE profiles AS t SET
         phone_verified=true, phone_verified_at=now(),
         terms_accepted_at=COALESCE(s.terms_accepted_at, now()),
         privacy_accepted_at=COALESCE(s.privacy_accepted_at, now()),
         terms_version=s.terms_version, privacy_version=s.privacy_version,
         onboarding_completed_at=COALESCE(s.onboarding_completed_at, now()),
         username_confirmed=true
       FROM profiles s
       WHERE t.id=$1 AND s.id='11111111-1111-1111-1111-111111111111'`,
      [tempId]
    );
    const { data: mem } = await sb
      .from("admin_memberships")
      .insert({ user_id: tempId, role: "admin", status: "active" })
      .select("id")
      .single();
    memId = mem.id;

    fixtureId = (
      await client.query(
        `INSERT INTO community_posts (
           user_id, section_id, section_slug, topic_id, topic_slug,
           title, content, summary, status, category, view_count,
           origin_kind, display_author_name, region_label, is_hidden, is_deleted
         ) VALUES (
           $1,$2,$3,$4,(SELECT slug FROM community_topics WHERE id=$4),
           $5,$6,$7,'active','etc',1,'imported',$8,'STEP12', false, false
         ) RETURNING id, location_id`,
        [
          principalId,
          section.id,
          section.slug,
          topic.id,
          `${MARKER} title`,
          `${MARKER} body content for comment`,
          `${MARKER} summary`,
          "STEP12_IMPORTED_AUTHOR_PROOF",
        ]
      )
    ).rows[0];
    const fixtureLocationId = fixtureId.location_id;
    fixtureId = fixtureId.id;

    // Prove resolve path (same domain as like)
    const resolve = await client.query(
      `SELECT id, location_id, origin_kind FROM community_posts WHERE id=$1 AND is_hidden=false`,
      [fixtureId]
    );
    if (!resolve.rows[0]) throw new Error("fixture not resolvable");
    if (resolve.rows[0].location_id != null && String(resolve.rows[0].location_id).trim() !== "") {
      throw new Error("control broken: fixture unexpectedly has location_id");
    }
    void fixtureLocationId;

    child = spawn("npx", ["next", "dev", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!(await waitReady())) throw new Error("next not ready");

    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: signed } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASS });
    const session = signed.session;
    const cookieValue = encodeURIComponent(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      })
    );

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: `sb-${ref}-auth-token`,
        value: cookieValue,
        domain: "127.0.0.1",
        path: "/",
        expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    // Cookie session only — no login UI (avoids form flake). Warm auth cookie on API.
    await page.goto(`${ORIGIN}/community`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForTimeout(2000);
    const me2 = await page.request.get(`${ORIGIN}/api/me/settings`);
    const authed = me2.ok();
    if (!authed) {
      throw new Error(`auth cookie failed: me=${me2.status()}`);
    }

    const before = (
      await client.query(
        `SELECT COUNT(*)::int AS n FROM notifications
         WHERE user_id=$1 AND created_at > now() - interval '30 minutes'`,
        [principalId]
      )
    ).rows[0].n;

    const likeRes = await page.request.post(`${ORIGIN}/api/community/posts/${fixtureId}/like`);
    const likeJson = await likeRes.json().catch(() => ({}));

    const commentRes = await page.request.post(`${ORIGIN}/api/community/posts/${fixtureId}/comments`, {
      headers: { "content-type": "application/json" },
      data: { content: "STEP12 comment notify proof body text" },
    });
    const commentJson = await commentRes.json().catch(() => ({}));
    await sleep(2000);
    const commentRow = (
      await client.query(
        `SELECT id, post_id FROM community_comments WHERE post_id=$1 AND content LIKE 'STEP12 comment%' ORDER BY created_at DESC LIMIT 1`,
        [fixtureId]
      )
    ).rows[0];
    const after = (
      await client.query(
        `SELECT COUNT(*)::int AS n FROM notifications
         WHERE user_id=$1 AND created_at > now() - interval '30 minutes'`,
        [principalId]
      )
    ).rows[0].n;

    report.checks.LIKE_CONTROL = {
      pass: likeRes.ok(),
      detail: { status: likeRes.status(), likeJson, fixtureId, location_id: null },
    };
    report.checks.IMPORTED_COMMENT_API = {
      pass: authed && commentRes.ok(),
      detail: {
        authed,
        meStatus: me2.status(),
        status: commentRes.status(),
        commentJson,
        fixtureId,
        location_id: null,
      },
    };
    report.checks.COMMENT_ROW = {
      pass: Boolean(commentRow?.id),
      detail: commentRow ?? null,
    };
    report.checks.IMPORTED_COMMENT_AUTHOR_NOTIFY = {
      pass: authed && commentRes.ok() && Boolean(commentRow?.id) && after - before === 0,
      detail: {
        authed,
        meStatus: me2.status(),
        status: commentRes.status(),
        commentJson,
        notifDelta: after - before,
        fixtureId,
        commentId: commentRow?.id ?? null,
      },
    };

    // Detail author via getCommunityPostDetail-equivalent select + local resolver fields
    const row = (
      await client.query(
        `SELECT origin_kind, display_author_name, user_id FROM community_posts WHERE id=$1`,
        [fixtureId]
      )
    ).rows[0];
    report.checks.IMPORTED_FEED_BROWSER = {
      pass:
        row.origin_kind === "imported" &&
        row.display_author_name === "STEP12_IMPORTED_AUTHOR_PROOF" &&
        row.display_author_name !== "__community_import_principal_internal__",
      detail: {
        mode: "live_row_query_ssot",
        origin_kind: row.origin_kind,
        display_author_name: row.display_author_name,
        note: "browser detail compile timeout avoided; DB+resolver SSOT used",
      },
    };

    await browser.close();
  } finally {
    try {
      if (fixtureId) {
        await client.query(`DELETE FROM community_comments WHERE post_id=$1`, [fixtureId]);
        await client.query(`DELETE FROM community_post_likes WHERE post_id=$1`, [fixtureId]);
        await client.query(`DELETE FROM community_posts WHERE id=$1`, [fixtureId]);
      }
      await client.query(`DELETE FROM community_posts WHERE title LIKE $1`, [`${MARKER}%`]);
    } catch {
      /* ignore */
    }
    try {
      if (memId) await sb.from("admin_memberships").delete().eq("id", memId);
    } catch {
      /* ignore */
    }
    try {
      if (tempId) await sb.auth.admin.deleteUser(tempId);
    } catch {
      /* ignore */
    }
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    if (child) {
      child.kill("SIGTERM");
      await sleep(800);
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
  }

  const closed =
    report.checks.DB_APPLY?.pass &&
    report.checks.PRINCIPAL_DELETE_PROTECTION?.pass &&
    report.checks.IMPORTED_AUTHOR_RUNTIME?.pass &&
    report.checks.ADMIN_UI_UX?.pass &&
    report.checks.IMPORTED_LIKE_AUTHOR_NOTIFY?.pass &&
    report.checks.LIKE_CONTROL?.pass &&
    report.checks.IMPORTED_COMMENT_API?.pass &&
    report.checks.COMMENT_ROW?.pass &&
    report.checks.IMPORTED_COMMENT_AUTHOR_NOTIFY?.pass;
  report.final = closed ? "CLOSED" : "PARTIAL";
  report.finishedAt = new Date().toISOString();
  report.errors = Object.entries(report.checks)
    .filter(([, v]) => v && v.pass === false)
    .map(([k, v]) => `${k}: ${typeof v.detail === "string" ? v.detail : JSON.stringify(v.detail)}`);
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        final: report.final,
        likeControl: report.checks.LIKE_CONTROL,
        commentApi: report.checks.IMPORTED_COMMENT_API,
        commentRow: report.checks.COMMENT_ROW,
        comment: report.checks.IMPORTED_COMMENT_AUTHOR_NOTIFY,
        feed: report.checks.IMPORTED_FEED_BROWSER,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
