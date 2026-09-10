/**
 * Operational crawl proof: migration + durable items + Travel PH adapter.
 * PUBLISH remains BLOCKED under REVIEW_REQUIRED.
 *
 * Usage: node --env-file=.env.local scripts/qa/community-crawl-operational-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const SOURCE_ID = "b221b18e-5655-4a48-91e5-ce4ce9d32f2b";
const BOARD_ID = "3ff35075-c7af-46bd-805b-a0cf210223cf";
const MIG = {
  file: "20261220120000_community_crawl_items_dataset.sql",
  version: "20261220120000",
};
const PSQL = process.env.STEP_PSQL || "/opt/homebrew/bin/psql";
const ARTIFACT = resolve(
  process.cwd(),
  "tests/e2e/.artifacts/community-crawl-operational-close.json"
);

const report = {
  step: "OPERATIONAL_CRAWLER_CLOSE",
  ok: false,
  final: "PARTIAL",
  checks: {},
  errors: [],
  summary: {},
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

function setCheck(key, pass, detail) {
  report.checks[key] = { pass: !!pass, detail: detail ?? null };
  if (!pass) report.errors.push(`${key}: ${detail ?? "FAIL"}`);
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

function psql(conn, args, input) {
  return execFileSync(PSQL, ["--dbname", conn, "-v", "ON_ERROR_STOP=1", ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function main() {
  loadEnvLocal();
  mkdirSync(resolve(process.cwd(), "tests/e2e/.artifacts"), { recursive: true });

  const conn = buildConnectionString();
  if (!conn) throw new Error("no db connection");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("missing supabase env");
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const have = psql(
    conn,
    ["-At", "-c", `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${MIG.version}'`]
  ).trim();
  if (!have) {
    psql(conn, ["-f", resolve(process.cwd(), "supabase/migrations", MIG.file)]);
    psql(conn, [
      "-c",
      `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${MIG.version}') ON CONFLICT DO NOTHING`,
    ]);
    setCheck("MIGRATION", true, "applied");
  } else {
    setCheck("MIGRATION", true, "already present");
  }

  const pool = [
    "마닐라생활",
    "세부한달살기",
    "필리핀여행자",
    "보라카이노트",
    "클락생활정보",
    "팔라완여행",
    "세부맛집탐방",
    "마닐라가이드",
    "필핀여행노트",
    "현지생활톡",
  ].map((display_name) => ({ display_name }));
  const now = Date.now();
  await sb
    .from("community_crawl_sources")
    .update({
      adapter_key: "travel_philippines",
      crawler_type: "custom_adapter",
      updated_at: new Date().toISOString(),
    })
    .eq("id", SOURCE_ID);

  await sb
    .from("community_crawl_boards")
    .update({
      crawl_mode: "custom_adapter",
      author_policy: "RANDOM_POOL",
      author_config: { random_pool: pool },
      date_policy: "RANDOM_RANGE",
      date_config: {
        random_min: new Date(now - 30 * 86400000).toISOString(),
        random_max: new Date(now).toISOString(),
      },
      view_policy: "RANDOM_RANGE",
      view_config: { random_min: 12, random_max: 480 },
      ingest_mode: "REVIEW_THEN_PUBLISH",
      max_posts: 15,
      enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", BOARD_ID);

  // Dynamic import via dedicated runner (top-level await safe)
  const { spawnSync } = await import("node:child_process");
  const crawlOut = spawnSync(
    "npx",
    ["tsx", "--env-file=.env.local", "scripts/qa/community-crawl-operational-run.mts"],
    { cwd: process.cwd(), encoding: "utf8", maxBuffer: 20 * 1024 * 1024, env: process.env }
  );
  if (crawlOut.status !== 0) {
    setCheck("REAL_CRAWL", false, crawlOut.stderr || crawlOut.stdout);
  } else {
    const line = crawlOut.stdout.trim().split("\n").filter(Boolean).pop();
    let parsed = {};
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = { raw: line };
    }
    setCheck("REAL_CRAWL", (parsed.items ?? 0) >= 10, JSON.stringify(parsed));
  }

  const { data: items, error: itemsErr } = await sb
    .from("community_crawl_items")
    .select("*")
    .eq("board_id", BOARD_ID)
    .order("last_crawled_at", { ascending: false })
    .limit(20);
  if (itemsErr) setCheck("DURABLE_ITEMS_QUERY", false, itemsErr.message);
  const list = items ?? [];
  setCheck("DURABLE_ITEMS_GE_10", list.length >= 10, `n=${list.length}`);
  setCheck(
    "FULL_BODY",
    list.filter((i) => String(i.dibay_body || "").length >= 40).length >= 10,
    "body filled"
  );
  setCheck(
    "COVER",
    list.filter((i) => !!i.source_cover_url).length >= 8,
    `covers=${list.filter((i) => !!i.source_cover_url).length}`
  );
  setCheck(
    "AUTHOR_PERSISTED",
    list.every((i) => i.display_author_name && !/travel philippines/i.test(i.display_author_name)),
    "display authors"
  );
  setCheck(
    "DATE_PERSISTED",
    list.every((i) => !!i.display_date),
    "display_date"
  );
  setCheck(
    "VIEW_PERSISTED",
    list.every((i) => typeof i.display_view_seed === "number"),
    "view_seed"
  );
  setCheck(
    "HARDCODED_FALLBACK",
    !list.some((i) => i.display_author_name === "예시 작성자"),
    "no example author"
  );

  const { count: againCount } = await sb
    .from("community_crawl_items")
    .select("*", { count: "exact", head: true })
    .eq("board_id", BOARD_ID);

  // second crawl for dedupe
  const crawl2 = spawnSync(
    "npx",
    ["tsx", "--env-file=.env.local", "scripts/qa/community-crawl-operational-run.mts"],
    { cwd: process.cwd(), encoding: "utf8", maxBuffer: 20 * 1024 * 1024, env: process.env }
  );
  let dedupe = {};
  try {
    dedupe = JSON.parse(crawl2.stdout.trim().split("\n").filter(Boolean).pop() || "{}");
  } catch {
    dedupe = {};
  }
  const { count: afterCount } = await sb
    .from("community_crawl_items")
    .select("*", { count: "exact", head: true })
    .eq("board_id", BOARD_ID);
  setCheck(
    "DEDUPE",
    (dedupe.inserted ?? 1) === 0 || afterCount === againCount,
    JSON.stringify({ dedupe, before: againCount, after: afterCount })
  );

  const genericSrc = readFileSync(
    resolve(process.cwd(), "lib/community-crawler/adapters/generic-html.ts"),
    "utf8"
  );
  setCheck(
    "GENERIC_CORE_POLLUTION",
    !genericSrc.includes("extractNextData") && !genericSrc.includes("__NEXT_DATA__"),
    "generic-html clean"
  );
  setCheck(
    "TRAVEL_ADAPTER",
    readFileSync(resolve(process.cwd(), "lib/community-crawler/adapters/travel-philippines.ts"), "utf8").includes(
      "TRAVEL_PH_NEXT_DATA_COVER_PATH"
    ),
    "adapter present"
  );

  report.summary = {
    DURABLE_ITEMS: list.length,
    PUBLISH: "BLOCKED_POLICY",
    SOURCE_POLICY: "REVIEW_REQUIRED",
    SAMPLE_AUTHORS: [...new Set(list.map((i) => i.display_author_name))].slice(0, 8),
  };
  report.ok = report.errors.length === 0;
  report.final = report.ok ? "PARTIAL" : "FAIL";
  // PARTIAL because Admin UI browser durability / scheduler live fire not proven in this script alone
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, final: report.final, summary: report.summary, errors: report.errors }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
