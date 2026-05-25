#!/usr/bin/env node
/**
 * dev:safe + .env.local — hub badge 3-run (서버 [route-perf] + [hub-badge-breakdown] 파싱).
 *   PLAYWRIGHT_NO_WEBSERVER=1 node scripts/measure-owner-hub-badge-perf.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const terminalLog =
  process.env.HUB_BADGE_TERMINAL_LOG ??
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals", "1.txt");

const LOGIN_IDS = (process.env.HUB_BADGE_LOGIN_IDS ?? "qqqq,wwww,zzzz,aaaa").split(",").map((s) => s.trim());
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? "1234";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function parseLogBlock(text, tag) {
  const rows = [];
  const re = new RegExp(`\\[${tag}\\]\\s*\\{`, "g");
  let match;
  while ((match = re.exec(text)) !== null) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) continue;
    const body = text.slice(start, end);
    const o = {};
    for (const line of body.split("\n")) {
      const m = line.match(/^\s*([a-z_0-9]+):\s*(.+?)\s*,?\s*$/);
      if (!m) continue;
      const k = m[1];
      let v = m[2].trim();
      if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      if (v === "true") o[k] = true;
      else if (v === "false") o[k] = false;
      else if (/^\d+$/.test(v)) o[k] = Number(v);
      else o[k] = v;
    }
    rows.push(o);
  }
  return rows;
}

function parseRoutePerfHubBadge(text, measureOnly = true) {
  return parseLogBlock(text, "route-perf").filter((o) => {
    if (o.route !== "/api/me/store-owner-hub-badge") return false;
    if (measureOnly && o.caller_component && o.caller_component !== "measure_script") return false;
    return true;
  });
}

function parseHubBadgeBreakdown(text, userIdShort) {
  return parseLogBlock(text, "hub-badge-breakdown").filter((o) => {
    if (!userIdShort) return true;
    return o.user_id_short === userIdShort;
  });
}

function parseHubBadgeWave1(text) {
  return parseLogBlock(text, "hub-badge-wave1");
}

function parseHubBadgeWave2(text) {
  return parseLogBlock(text, "hub-badge-wave2");
}

function judgeRow(r, b) {
  const issues = [];
  if (r.deferred !== true) issues.push("deferred≠true");
  if (r.first_paint_blocking !== false) issues.push("fp_blocking");
  if (r.cache_hit === 1) {
    if (typeof r.db_ms === "number" && r.db_ms > 50) issues.push(`db_ms=${r.db_ms}`);
  } else if (typeof r.total_ms === "number" && r.total_ms > 200) {
    issues.push(`cold total=${r.total_ms}`);
  }
  if (!r.client_call_source) issues.push("no source");
  if (r.cache_hit === 0 && b && !b.worst_stage) issues.push("no breakdown");
  return issues.length ? `△ ${issues.join(", ")}` : "✓";
}

async function signInCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY (.env.local)");

  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? url.replace(/https:\/\//, "").split(".")[0];
  const cookieName = `sb-${ref}-auth-token`;

  for (const loginId of LOGIN_IDS) {
    if (!loginId) continue;
    const email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
    if (error || !data.session) continue;
    const session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user,
    };
    return {
      cookieHeader: `${cookieName}=${encodeURIComponent(JSON.stringify(session))}`,
      userId: data.user.id,
      loginId,
    };
  }
  throw new Error(`로그인 실패 — 시도: ${LOGIN_IDS.join(", ")}`);
}

async function hubFetch(cookieHeader, run) {
  const cold = run === 1;
  /** run1 RPC fill + upsert, run2 counter hit — dev-safe는 cmFresh+hubBadgeBypass 둘 다 필요 */
  const q =
    run === 1
      ? "?hubBadgeBypass=1&cmFresh=1&findHubFresh=1&unreadPartsFresh=1&cmUnreadFresh=1&storeOrderUnreadFresh=1&storeAttentionFresh=1"
      : run <= 2
        ? "?hubBadgeBypass=1&cmFresh=1"
        : "";
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/me/store-owner-hub-badge${q}`, {
    headers: {
      Cookie: cookieHeader,
      "x-samarket-hub-badge-deferred": "1",
      "x-samarket-first-paint-blocking": "0",
      "x-samarket-client-call-source": "owner_hub_badge_store",
      "x-samarket-caller-component": "measure_script",
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  return {
    run,
    http_status: res.status,
    client_ms: Date.now() - t0,
    ok: body?.ok === true,
    total_field: body?.total,
    cold,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mergeRun(routeRows, breakdownRows) {
  const out = [];
  const n = Math.max(routeRows.length, breakdownRows.length);
  for (let i = 0; i < n; i++) {
    const r = routeRows[i] ?? {};
    const b = breakdownRows[i] ?? {};
    out.push({ route: r, breakdown: b });
  }
  return out;
}

async function main() {
  loadEnvLocal();
  const logBefore = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const perfBefore = parseRoutePerfHubBadge(logBefore).length;
  const wave1Before = parseHubBadgeWave1(logBefore).length;
  const wave2Before = parseHubBadgeWave2(logBefore).length;

  const auth = await signInCookie();
  const userIdShort = auth.userId.slice(0, 8);
  const breakdownBefore = parseHubBadgeBreakdown(logBefore, userIdShort).length;
  console.log(`auth: ${auth.loginId} (${userIdShort}…)`);

  const clientRows = [];
  for (let i = 1; i <= 3; i++) {
    clientRows.push(await hubFetch(auth.cookieHeader, i));
    /** run1 fill 후: memory TTL(4s) 만료 + counter TTL(5s) 유지 → 4.2s gap */
    /** run2→3: hub route TTL 5s — 6s gap이면 run3 cold. run3 warm 검증은 4.2s gap */
    if (i < 3) await sleep(4_200);
  }

  await sleep(800);
  const logAfter = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const routeRows = parseRoutePerfHubBadge(logAfter).slice(perfBefore);
  const breakdownRows = parseHubBadgeBreakdown(logAfter, userIdShort).slice(breakdownBefore);
  const wave1Rows = parseHubBadgeWave1(logAfter).slice(wave1Before);
  const wave2Rows = parseHubBadgeWave2(logAfter).slice(wave2Before);
  const merged = mergeRun(routeRows, breakdownRows).map((row, i) => ({
    ...row,
    wave1: wave1Rows[i] ?? {},
    wave2: wave2Rows[i] ?? {},
  }));

  console.log("\n=== 클라이언트 wall (fetch) ===\n");
  console.table(clientRows);

  if (merged.length < 3) {
    console.warn(
      `\n[warn] 서버 로그 ${merged.length}건 (기대 3) — 터미널: ${terminalLog}`
    );
  }

  const table = merged.slice(-3).map(({ route: r, breakdown: b, wave1: w1, wave2: w2 }, i) => {
    const upMs = b.unread_parts_ms ?? r.unread_parts_ms ?? w1.unread_parts_ms ?? "";
    const fhMs = b.find_hub_store_ms ?? w1.find_hub_store_ms ?? r.find_hub_store_ms ?? "";
    const fhVia = b.find_hub_store_via ?? w1.find_hub_store_via ?? "";
    const fhCacheHit = b.find_hub_store_cache_hit ?? "";
    const cmMs = b.cm_unread_ms ?? r.cm_unread_ms ?? w2.cm_unread_ms ?? "";
    const cmVia = b.cm_unread_via ?? r.cm_unread_via ?? w2.cm_unread_via ?? "";
    const soMs = b.store_order_unread_ms ?? w2.store_order_unread_ms ?? "";
    const soVia = b.store_order_unread_via ?? w2.store_order_unread_via ?? "";
    const saMs = b.store_attention_total_ms ?? r.store_attention_ms ?? "";
    const saVia = b.store_attention_via ?? "";
    let pass = "";
    if (i === 0) {
      pass =
        fhVia === "postgrest" || fhVia === "postgrest_embed" || fhVia === "empty"
          ? "✓ run1 postgrest"
          : fhVia === "memory" && (fhMs === "" || fhMs <= 50)
            ? "✓ run1 (prior memory)"
            : "△ run1";
    } else if (i === 1) {
      const upVia = b.unread_parts_via ?? w1.unread_parts_via ?? r.unread_parts_via ?? "";
      const deferOk = r.deferred === true;
      const fpOk = r.first_paint_blocking === false;
      const dbOk = typeof r.db_ms !== "number" || r.db_ms <= 50;
      const routeWarm = r.cache_hit === 1 && dbOk && deferOk && fpOk;
      const fhOk =
        (fhVia === "memory" || fhCacheHit === 1) &&
        (typeof fhMs !== "number" || fhMs <= 50);
      const upOk =
        upVia === "memory" && (typeof upMs !== "number" || upMs <= 20);
      const cmOk = cmVia === "memory" && (typeof cmMs !== "number" || cmMs <= 20);
      const soOk = soVia === "memory" && (typeof soMs !== "number" || soMs <= 20);
      const saOk = saVia === "memory" && (typeof saMs !== "number" || saMs <= 20);
      const stageOk = fhOk && upOk && cmOk && soOk && saOk;
      pass = routeWarm
        ? "✓ route warm"
        : stageOk && deferOk && fpOk && dbOk
          ? "✓ memory hit"
          : `△ db=${r.db_ms} fh=${fhVia} up=${upVia} cm=${cmVia} so=${soVia} sa=${saVia}`;
    } else {
      const deferOk = r.deferred === true;
      const fpOk = r.first_paint_blocking === false;
      const dbOk = typeof r.db_ms !== "number" || r.db_ms <= 50;
      pass =
        r.cache_hit === 1 && deferOk && fpOk && dbOk
          ? "✓ warm"
          : judgeRow(r, b);
    }
    const upViaCol = b.unread_parts_via ?? w1.unread_parts_via ?? r.unread_parts_via ?? "";
    return {
      run: i + 1,
      total_ms: r.total_ms,
      db_ms: r.db_ms,
      cache_hit: r.cache_hit,
      unread_parts_via: upViaCol,
      find_hub_store_via: fhVia,
      cm_unread_via: cmVia,
      store_order_unread_via: soVia,
      store_attention_via: saVia,
      deferred: r.deferred === true,
      first_paint_blocking: r.first_paint_blocking === false,
      판정: pass,
    };
  });

  const coldRuns = merged.filter((m) => m.breakdown?.cache_hit === 0);
  if (coldRuns.length >= 2) {
    const r1 = coldRuns[0].breakdown;
    const r2 = coldRuns[coldRuns.length - 1].breakdown;
    console.log(
      `\n[unread counter flow] run1 via=${r1?.unread_parts_via} ${r1?.unread_parts_ms}ms → run${coldRuns.length} via=${r2?.unread_parts_via} age=${r2?.unread_counter_age_ms ?? "?"}ms`
    );
  }

  const coldB = merged.find((m) => m.breakdown?.cache_hit === 0)?.breakdown;
  if (coldB) {
    const up = coldB.unread_parts_ms ?? 0;
    const fh = coldB.find_hub_store_ms ?? 0;
    let nextTarget = up >= fh ? "unread_parts" : "find_hub_store";
    let nextHint = "";
    if (nextTarget === "unread_parts" && up >= 200) {
      nextHint = " → unread counter 테이블 후보";
    } else if (nextTarget === "find_hub_store" && fh >= 200) {
      nextHint = " → find_hub memory TTL 확인";
    }
    console.log(
      `\n[wave1 breakdown] wave1=${coldB.query_wave_1_ms}ms unread=${up}(${coldB.unread_parts_via ?? "?"}) find_hub=${fh} rows=${coldB.find_hub_store_rows ?? 0} slack=${coldB.query_wave_1_parallel_slack_ms ?? 0}ms`
    );
    console.log(`[wave1 next] ${nextTarget}${nextHint}`);
  }

  const coldW2 = merged.find((m) => m.breakdown?.cache_hit === 0)?.breakdown;
  if (coldW2) {
    const cm = coldW2.cm_unread_ms ?? 0;
    const so = coldW2.store_order_unread_ms ?? 0;
    let w2Target = cm >= so ? "cm_unread" : "store_order_unread";
    let w2Hint = "";
    if (w2Target === "cm_unread" && cm >= 200) {
      w2Hint = " → CM unread counter/RPC 후보";
    } else if (w2Target === "store_order_unread" && so >= 200) {
      w2Hint = " → store order messenger unread RPC/counter 후보";
    }
    console.log(
      `\n[wave2 breakdown] wave2=${coldW2.query_wave_2_ms}ms cm=${cm}(${coldW2.cm_unread_via ?? "?"}) store_order=${so}(${coldW2.store_order_unread_via ?? "?"}) slack=${coldW2.query_wave_2_parallel_slack_ms ?? 0}ms`
    );
    console.log(`[wave2 next] ${w2Target}${w2Hint}`);
  }

  console.log("\n=== 최종 3-run (route-perf + hub-badge-breakdown) ===\n");
  console.table(table);

  const memHits = [
    "[hub-badge-unread-parts-memory-hit]",
    "[find-hub-store-memory-hit]",
    "[cm-unread-memory-hit]",
    "[store-order-unread-memory-hit]",
    "[store-attention-memory-hit]",
  ];
  const logTail = logAfter.slice(Math.max(0, logAfter.length - 120_000));
  const hitLines = memHits.filter((tag) => logTail.includes(tag));
  if (hitLines.length) {
    console.log("\n[memory-hit tags in terminal tail]", hitLines.join(", "));
  } else {
    console.warn("\n[warn] memory-hit 로그 미검출 — dev 재시작·run2(4.2s gap) 확인");
  }

  const cold = table.find((t) => t.cache_hit === 0) ?? table[0];
  if (cold?.worst_stage) {
    console.log(`\n[cold worst_stage] ${cold.worst_stage} (${cold.worst_stage === table[0]?.worst_stage ? table[0].worst_stage : cold.worst_stage} ms in breakdown log)`);
  }

  const coldBreakdown = merged.find((m) => m.breakdown?.cache_hit === 0)?.breakdown;
  if (coldBreakdown?.worst_stage) {
    console.log(
      `\n[cold breakdown] worst_stage=${coldBreakdown.worst_stage} worst_stage_ms=${coldBreakdown.worst_stage_ms}`
    );
    console.log(
      `  wave1=${coldBreakdown.query_wave_1_ms} (unread=${coldBreakdown.unread_parts_ms} find_hub=${coldBreakdown.find_hub_store_ms}) wave2=${coldBreakdown.query_wave_2_ms} (cm=${coldBreakdown.cm_unread_ms} store_order=${coldBreakdown.store_order_unread_ms}) wave3=${coldBreakdown.query_wave_3_ms}`
    );
  }

  const deepRows = parseLogBlock(logAfter, "hub-badge-deep-breakdown").slice(-5);
  if (deepRows.length) {
    console.log("\n=== [hub-badge-deep-breakdown] latest (up to 5) ===\n");
    console.table(
      deepRows.map((d) => ({
        path: d.path,
        total_ms: d.total_ms,
        db_fetch_ms: d.db_fetch_ms,
        deserialize_ms: d.snapshot_deserialize_ms,
        aggregate_ms: d.aggregate_compute_ms,
        payload_ms: d.payload_build_ms,
        serialize_ms: d.json_serialize_ms,
        transport_ms: d.transport_ms,
        row_bytes: d.query_row_bytes,
        response_bytes: d.response_bytes,
        cm_rooms: d.cm_unread_room_count,
      }))
    );
  } else {
    console.warn("\n[warn] [hub-badge-deep-breakdown] 미검출 — dev 재시작 후 hub badge 1회 호출");
  }

  const run2 = table[1];
  const run3 = table[2];
  const run2ok =
    run2 &&
    run2.deferred === true &&
    run2.first_paint_blocking === false &&
    (run2.판정.startsWith("✓") ||
      (typeof run2.db_ms === "number" && run2.db_ms <= 50));
  const run3ok = run3?.cache_hit === 1 && run3?.판정?.startsWith("✓");
  const pass = table.length >= 3 && run2ok && (run3ok || run3?.판정?.startsWith("✓"));
  console.log(
    pass
      ? "\n✓ 최종 검증 합격 (run2 memory 또는 route warm, run3 hub TTL)"
      : "\n△ 최종 검증 미달 — 터미널 [route-perf]·memory-hit 태그 확인"
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
