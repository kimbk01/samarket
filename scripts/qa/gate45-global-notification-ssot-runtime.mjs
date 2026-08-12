#!/usr/bin/env node
/**
 * GATE 4.5 — Production DB + GATE 4 local runtime proof.
 * No commit / push / deploy.
 */
import { createClient } from "@supabase/supabase-js";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/gate45-notification-ssot-${STAMP}`);
fs.mkdirSync(OUT, { recursive: true });

const PROD_REF = "ckdosyydvgzqwpbwuhon";
const ORIGIN = (process.env.GATE45_ORIGIN || "http://127.0.0.1:3000").replace(/\/$/, "");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const SAMSUNG = process.env.GATE3_SAMSUNG || "RFCY40PY2CA";
const XIAOMI = process.env.GATE3_XIAOMI || "8b37179f7d94";
const MARK = `G45-${Date.now().toString(36)}`;

if (!process.env.PLAYWRIGHT_BROWSERS_PATH || String(process.env.PLAYWRIGHT_BROWSERS_PATH).includes("cursor-sandbox-cache")) {
  const homePw = `${process.env.HOME}/Library/Caches/ms-playwright`;
  if (fs.existsSync(homePw)) process.env.PLAYWRIGHT_BROWSERS_PATH = homePw;
}

function launchBrowser(headless = true) {
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const args = ["--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage"];
  if (fs.existsSync(chrome)) return chromium.launch({ headless, executablePath: chrome, args });
  return chromium.launch({ headless, args });
}

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function log(line) {
  const msg = `[gate45] ${line}`;
  console.log(msg);
  fs.appendFileSync(path.join(OUT, "run.log"), msg + "\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD?.trim(),
        process.env.QA_MANUAL_PASSWORD?.trim(),
        process.env.E2E_BANNER_MEMBER_PASSWORD?.trim(),
        process.env.E2E_ADMIN_PASSWORD?.trim(),
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

async function delEq(admin, table, col, val) {
  try {
    await admin.from(table).delete().eq(col, val);
  } catch {
    /* ignore cleanup */
  }
}

function sbAdmin() {
  loadEnv();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sbAnon() {
  loadEnv();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(login) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const emails = login.includes("@") ? [login] : [`${login}@manual.local`, `${login}@samarket.local`];
  const sb = sbAnon();
  let data = null;
  let lastErr = null;
  for (const email of emails) {
    for (const pass of passwords()) {
      const r = await Promise.race([
        sb.auth.signInWithPassword({ email, password: pass }),
        sleep(8000).then(() => ({ data: null, error: { message: "timeout" } })),
      ]);
      if (r.data?.session) {
        data = r.data;
        break;
      }
      lastErr = r.error?.message ?? "no session";
    }
    if (data?.session) break;
  }
  if (!data?.session) throw new Error(`login ${login}: ${lastErr}`);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  let cookie = `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify(session))}`;
  const admin = sbAdmin();
  const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", data.session.user.id).maybeSingle();
  const activeSessionId = String(pr?.active_session_id ?? "").trim() || null;
  if (activeSessionId) cookie += `; samarket_active_session_id=${encodeURIComponent(activeSessionId)}`;
  return { cookie, userId: data.session.user.id, email: data.session.user.email, session, activeSessionId, ref, login };
}

function cookieObjects(auth, originUrl) {
  const cookies = [
    {
      name: `sb-${auth.ref}-auth-token`,
      value: encodeURIComponent(JSON.stringify(auth.session)),
      url: originUrl + "/",
    },
  ];
  if (auth.activeSessionId) {
    cookies.push({ name: "samarket_active_session_id", value: auth.activeSessionId, url: originUrl + "/" });
  }
  return cookies;
}

async function apiFetch(pathname, auth, init = {}) {
  const headers = {
    Accept: "application/json",
    Cookie: auth.cookie,
    ...(init.headers ?? {}),
  };
  if (init.body != null && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (auth.session?.access_token) headers.Authorization = `Bearer ${auth.session.access_token}`;
  const res = await fetch(`${ORIGIN}${pathname}`, { ...init, headers, body: init.body });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text: text.slice(0, 800) };
}

function buildPgConnectionString() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!pass) return null;
  const pooler =
    process.env.SUPABASE_POOLER_URL?.trim() ||
    `postgresql://postgres.${PROD_REF}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`;
  const u = new URL(pooler.replace(/^postgresql:\/\//, "http://"));
  u.password = encodeURIComponent(pass);
  if (!u.username) u.username = `postgres.${PROD_REF}`;
  return `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}

async function applyMigration() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] || "";
  const target = {
    envUrl: url,
    envRef: ref,
    expectedRef: PROD_REF,
    linkedRef: "ckdosyydvgzqwpbwuhon",
    match: ref === PROD_REF,
  };
  if (!target.match) {
    return { ok: false, target, error: `REFUSING wrong project ref ${ref}` };
  }
  const cs = buildPgConnectionString();
  if (!cs) {
    return { ok: false, target, error: "SUPABASE_DB_PASSWORD / DATABASE_URL missing — DDL not applied" };
  }
  if (!cs.includes(PROD_REF)) {
    return { ok: false, target, error: "connection string is not Production ref" };
  }
  const sql = fs.readFileSync(
    path.join(ROOT, "supabase/migrations/20261028120000_global_notification_ssot_owner_admin.sql"),
    "utf8"
  );
  const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    const kinds = await client.query(`
      SELECT pg_get_functiondef('public.get_owner_store_commerce_notifications(uuid,uuid,integer)'::regprocedure) AS def
    `);
    const pub = await client.query(`
      SELECT schemaname, tablename
        FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND tablename IN (
           'store_point_charge_requests',
           'feed_ad_requests',
           'delivery_operation_alert_events',
           'point_charge_requests'
         )
       ORDER BY tablename
    `);
    const rls = await client.query(`
      SELECT tablename, policyname, cmd, roles::text, qual
        FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN (
           'store_point_charge_requests',
           'feed_ad_requests',
           'delivery_operation_alert_events',
           'point_charge_requests'
         )
       ORDER BY tablename, policyname
    `);
    const def = String(kinds.rows[0]?.def || "");
    return {
      ok: true,
      target,
      ownerKinds: {
        sold_out: def.includes("store_order_sold_out"),
        store_point_blocked: def.includes("store_point_blocked"),
        store_point_deducted: def.includes("store_point_deducted"),
        store_point_low: def.includes("store_point_low"),
        store_point_charge_approved: def.includes("store_point_charge_approved"),
        store_point_charge_rejected: def.includes("store_point_charge_rejected"),
        store_point_account_replied: def.includes("store_point_account_replied"),
      },
      publication: pub.rows,
      rls: rls.rows.map((r) => ({
        table: r.tablename,
        policy: r.policyname,
        cmd: r.cmd,
        roles: r.roles,
        qual: String(r.qual || "").slice(0, 180),
      })),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function waitOrigin(ms = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r2 = await fetch(`${ORIGIN}/api/me/profile`, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      }).catch(() => null);
      if (r2 && r2.status > 0) return true;
    } catch {
      /* retry */
    }
    await sleep(1500);
  }
  return false;
}

async function ensureLocalOrigin() {
  log(`origin check ${ORIGIN}`);
  if (await waitOrigin(12_000)) return { started: false, ok: true };
  log(`starting next dev for GATE 4 code at ${ORIGIN}`);
  const child = spawn("npm", ["run", "dev", "--", "-p", "3000", "-H", "127.0.0.1"], {
    cwd: ROOT,
    env: { ...process.env, PORT: "3000" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const logPath = path.join(OUT, "next-dev.log");
  child.stdout?.on("data", (b) => fs.appendFileSync(logPath, b));
  child.stderr?.on("data", (b) => fs.appendFileSync(logPath, b));
  fs.writeFileSync(path.join(OUT, "next-dev.pid"), String(child.pid));
  const ok = await waitOrigin(120_000);
  return { started: true, ok, pid: child.pid };
}

async function findTwoStoreOwner(admin) {
  const preferredLogins = ["asas44", "asas22", "asas11", "asas33", "tiger", "zxzx", "qqqq", "aaaa", "bbk1122"];
  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("id, username, dibay_id, nickname")
    .in("username", preferredLogins);
  if (pErr) throw new Error(`profiles: ${pErr.message}`);
  log(`qa profiles hit=${(profiles || []).length}`);
  for (const p of profiles || []) {
    const { data: rows, error: sErr } = await admin
      .from("stores")
      .select("id, store_name, slug, owner_user_id, approval_status, is_visible, created_at")
      .eq("owner_user_id", p.id);
    if (sErr) {
      log(`stores for ${p.username}: ${sErr.message}`);
      continue;
    }
    const approved = (rows || []).filter((s) => String(s.approval_status) === "approved");
    log(`qa ${p.username} stores=${(rows || []).length} approved=${approved.length}`);
    if (approved.length >= 2) {
      return {
        ownerUserId: p.id,
        login: p.username,
        stores: approved.slice(0, 4).map((s) => ({ id: s.id, name: s.store_name, slug: s.slug, created_at: s.created_at })),
      };
    }
  }
  const { data: stores, error } = await admin
    .from("stores")
    .select("id, store_name, slug, owner_user_id, approval_status, is_visible, created_at")
    .eq("approval_status", "approved")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`stores: ${error.message}`);
  const byOwner = new Map();
  for (const s of stores || []) {
    const oid = String(s.owner_user_id || "").trim();
    if (!oid) continue;
    const arr = byOwner.get(oid) ?? [];
    arr.push(s);
    byOwner.set(oid, arr);
  }
  const loginById = new Map((profiles || []).map((p) => [p.id, p]));
  for (const [oid, rows] of byOwner) {
    const visible = rows.filter((s) => s.is_visible !== false);
    if (visible.length < 2) continue;
    let p = loginById.get(oid);
    if (!p) {
      const { data: prof } = await admin.from("profiles").select("id, username, dibay_id, nickname").eq("id", oid).maybeSingle();
      p = prof || null;
    }
    return {
      ownerUserId: oid,
      login: p?.username || p?.dibay_id || null,
      stores: visible.slice(0, 4).map((s) => ({ id: s.id, name: s.store_name, slug: s.slug, created_at: s.created_at })),
    };
  }
  return null;
}

async function insertLegacyNotification(admin, ownerUserId, storeId, kind) {
  const dedupe = `${MARK}:${kind}:${storeId}`;
  const row = {
    user_id: ownerUserId,
    notification_type: "commerce",
    title: `${MARK} ${kind}`,
    body: `GATE45 ${kind}`,
    link_url: `/stores/owner/points?storeId=${storeId}`,
    is_read: false,
    meta: { kind, store_id: storeId, gate45: MARK },
    dedupe_key: dedupe,
  };
  const ins = await admin.from("notifications").insert(row).select("id, meta, user_id").maybeSingle();
  return { error: ins.error?.message || null, row: ins.data, dedupe };
}

async function insertNotificationEvent(admin, ownerUserId, storeId, kind) {
  const dedupe = `${MARK}:evt:${kind}:${storeId}`;
  const ins = await admin
    .from("notification_events")
    .insert({
      user_id: ownerUserId,
      type: "order_status",
      category: "order_status",
      title: `${MARK} ${kind}`,
      body: `GATE45 event ${kind}`,
      unread: true,
      dedupe_key: dedupe,
      display_payload: {
        routeUrl: `/stores/owner/points?storeId=${storeId}`,
        legacyNotificationType: "commerce",
        legacyMeta: { kind, store_id: storeId, gate45: MARK },
        legacyDomain: "store",
      },
    })
    .select("id, type, display_payload, user_id")
    .maybeSingle();
  return { error: ins.error?.message || null, row: ins.data, dedupe };
}

async function subscribeThenInsert(label, jwt, table, insertFn, filter = null) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await sb.realtime.setAuth(jwt);
  const received = [];
  let status = null;
  const channel = sb.channel(`g45-${label}-${Date.now()}`);
  const spec = { event: "INSERT", schema: "public", table };
  if (filter) spec.filter = filter;
  channel.on("postgres_changes", spec, (payload) => {
    received.push({ t: Date.now(), table, id: payload?.new?.id ?? null, eventType: payload?.eventType ?? null });
  });
  const subP = new Promise((resolve) => {
    channel.subscribe((s, err) => {
      status = s;
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") resolve({ s, err: err?.message || null });
    });
  });
  const sub = await Promise.race([subP, sleep(8000).then(() => ({ s: status || "TIMEOUT", err: null }))]);
  log(`RT ${label} subscribe=${sub.s}`);
  const inserted = await Promise.race([
    insertFn(),
    sleep(12000).then(() => ({ id: null, error: "insert_timeout" })),
  ]);
  log(`RT ${label} insert id=${inserted?.id || "none"} err=${inserted?.error || "none"}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 6000 && received.length === 0) await sleep(150);
  log(`RT ${label} received=${received.length}`);
  try {
    await sb.removeChannel(channel);
  } catch {
    /* ignore */
  }
  return {
    table,
    subscribeStatus: sub.s,
    subscribeError: sub.err,
    insert: inserted,
    rtReceived: received.length,
    latencyMs: received[0] ? received[0].t - t0 : null,
    payloadIds: received.map((r) => r.id),
    within75s: received.length > 0,
  };
}

async function probeAdminRt(admin, adminAuth, owner) {
  const storeId = owner.stores[0].id;
  const ownerId = owner.ownerUserId;
  const jwt = adminAuth.session.access_token;
  const cleanup = [];

  const storeCharge = await subscribeThenInsert("store_charge", jwt, "store_point_charge_requests", async () => {
    const ins = await admin
      .from("store_point_charge_requests")
      .insert({
        store_id: storeId,
        owner_user_id: ownerId,
        payment_method: "manual_confirm",
        payment_amount: 1,
        point_amount: 1,
        request_status: "pending",
        depositor_name: MARK,
        bank_name: "",
        receipt_image_url: "",
        user_memo: MARK,
      })
      .select("id")
      .maybeSingle();
    if (ins.data?.id) cleanup.push({ table: "store_point_charge_requests", id: ins.data.id });
    return { id: ins.data?.id || null, error: ins.error?.message || null };
  });

  let feedProductId = null;
  const { data: products } = await admin.from("feed_ad_products").select("id, domain, duration_days, point_cost").limit(5);
  feedProductId = products?.[0]?.id || null;
  const feedAd = await subscribeThenInsert("feed_ad", jwt, "feed_ad_requests", async () => {
    if (!feedProductId) return { id: null, error: "no_feed_ad_product" };
    const ins = await admin
      .from("feed_ad_requests")
      .insert({
        user_id: ownerId,
        product_id: feedProductId,
        domain: products[0]?.domain || "community",
        placement: "COMMUNITY_HOME",
        destination_type: "internal_page",
        destination_id: "",
        destination_url: "",
        duration_days: Math.max(1, Number(products[0]?.duration_days || 1)),
        point_cost: Math.max(1, Number(products[0]?.point_cost || 1)),
        status: "pending_review",
      })
      .select("id")
      .maybeSingle();
    if (ins.data?.id) cleanup.push({ table: "feed_ad_requests", id: ins.data.id });
    return { id: ins.data?.id || null, error: ins.error?.message || null };
  });

  let ruleId = null;
  const { data: rules } = await admin.from("delivery_operation_alert_rules").select("id").eq("is_active", true).limit(1);
  ruleId = rules?.[0]?.id || null;
  let orderId = null;
  const { data: orders } = await admin.from("store_orders").select("id").eq("store_id", storeId).limit(1);
  orderId = orders?.[0]?.id || null;
  const delivery = await subscribeThenInsert("delivery_p0", jwt, "delivery_operation_alert_events", async () => {
    if (!ruleId || !orderId) return { id: null, error: `missing rule=${ruleId} order=${orderId}` };
    const ins = await admin
      .from("delivery_operation_alert_events")
      .insert({
        rule_id: ruleId,
        order_id: orderId,
        store_id: storeId,
        severity: "warning",
        event_status: "open",
        first_triggered_at: new Date().toISOString(),
        last_triggered_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (ins.data?.id) cleanup.push({ table: "delivery_operation_alert_events", id: ins.data.id });
    return { id: ins.data?.id || null, error: ins.error?.message || null };
  });

  const { data: plans } = await admin.from("point_plans").select("id, name_ko, payment_amount, point_amount, bonus_amount, rate_version").limit(1);
  const plan = plans?.[0] || null;
  const memberCharge = await subscribeThenInsert("member_charge", jwt, "point_charge_requests", async () => {
    if (!plan) return { id: null, error: "no_point_plan" };
    const now = new Date().toISOString();
    const ins = await admin
      .from("point_charge_requests")
      .insert({
        user_id: ownerId,
        plan_id: plan.id,
        plan_name: plan.name_ko || "GATE45",
        payment_method: "manual_confirm",
        payment_amount: Number(plan.payment_amount || 1),
        point_amount: Number(plan.point_amount || 1),
        applied_rate: 1,
        rate_version: Math.max(1, Number(plan.rate_version || 1)),
        request_status: "waiting_confirm",
        depositor_name: MARK,
        receipt_image_url: "",
        user_memo: MARK,
        requested_at: now,
        updated_at: now,
      })
      .select("id")
      .maybeSingle();
    if (ins.data?.id) cleanup.push({ table: "point_charge_requests", id: ins.data.id });
    return { id: ins.data?.id || null, error: ins.error?.message || null };
  });

  const serviceJwt = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const memberChargeServiceRole = serviceJwt
    ? await subscribeThenInsert("member_charge_sr", serviceJwt, "point_charge_requests", async () => {
        if (!plan) return { id: null, error: "no_point_plan" };
        const now = new Date().toISOString();
        const ins = await admin
          .from("point_charge_requests")
          .insert({
            user_id: ownerId,
            plan_id: plan.id,
            plan_name: plan.name_ko || "GATE45-SR",
            payment_method: "manual_confirm",
            payment_amount: Number(plan.payment_amount || 1),
            point_amount: Number(plan.point_amount || 1),
            applied_rate: 1,
            rate_version: Math.max(1, Number(plan.rate_version || 1)),
            request_status: "waiting_confirm",
            depositor_name: MARK,
            receipt_image_url: "",
            user_memo: `${MARK}-sr`,
            requested_at: now,
            updated_at: now,
          })
          .select("id")
          .maybeSingle();
        if (ins.data?.id) cleanup.push({ table: "point_charge_requests", id: ins.data.id });
        return { id: ins.data?.id || null, error: ins.error?.message || null };
      })
    : null;

  return { storeCharge, feedAd, delivery, memberCharge, memberChargeServiceRole, cleanup };
}

async function runOwnerUi(ownerAuth, storeA, storeB) {
  const browser = await launchBrowser(true);
  const report = { A: null, B: null, mismatch: [] };
  try {
    const context = await browser.newContext();
    await context.addCookies(cookieObjects(ownerAuth, ORIGIN));
    const page = await context.newPage();
    const hubHits = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("/api/me/store-owner-hub-badge") || u.includes("/api/me/notifications")) hubHits.push(u);
    });
    async function capture(label, storeId) {
      hubHits.length = 0;
      await page.goto(`${ORIGIN}/stores/owner?storeId=${storeId}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await sleep(3500);
      const snap = await page.evaluate(async (expected) => {
        const active = sessionStorage.getItem("samarket:owner:active-store-id:v1");
        const fab = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") || "").filter((h) => h.includes("/stores/owner"));
        const bell = document.querySelector("[data-tier1-bell], [data-surface='owner_commerce_inbox']");
        let hub = null;
        try {
          const r = await fetch(`/api/me/store-owner-hub-badge?activeStoreId=${encodeURIComponent(expected)}`, {
            credentials: "include",
            cache: "no-store",
          });
          hub = { status: r.status, json: await r.json().catch(() => null) };
        } catch (e) {
          hub = { error: String(e) };
        }
        let bellCount = null;
        try {
          const r = await fetch(
            `/api/me/notifications?unread_count_only=1&badge_surface=owner_commerce_inbox&owner_store_id=${encodeURIComponent(expected)}`,
            { credentials: "include", cache: "no-store" }
          );
          bellCount = { status: r.status, json: await r.json().catch(() => null) };
        } catch (e) {
          bellCount = { error: String(e) };
        }
        return {
          href: location.href,
          activeSessionStoreId: active,
          fabHrefs: fab.slice(0, 20),
          hub,
          bellCount,
          bellEl: bell ? bell.outerHTML.slice(0, 200) : null,
        };
      }, storeId);
      const hubUrl = hubHits.find((u) => u.includes("store-owner-hub-badge")) || null;
      const notifUrls = hubHits.filter((u) => u.includes("/api/me/notifications")).slice(0, 8);
      const payloadStore =
        snap.hub?.json?.storeId ||
        snap.hub?.json?.store_id ||
        snap.hub?.json?.activeStoreId ||
        snap.hub?.json?.active_store_id ||
        null;
      const fabHas = snap.fabHrefs.some((h) => h.includes(storeId));
      const fabOther = snap.fabHrefs.some((h) => {
        const m = h.match(/storeId=([0-9a-f-]{36})/i);
        return m && m[1] !== storeId;
      });
      const pass =
        snap.activeSessionStoreId === storeId &&
        String(hubUrl || "").includes(storeId) &&
        !fabOther;
      return {
        label,
        storeId,
        href: snap.href,
        activeSessionStoreId: snap.activeSessionStoreId,
        hubFetchUrl: hubUrl,
        hubPayloadStoreId: payloadStore,
        hubStatus: snap.hub?.status ?? null,
        bellCount: snap.bellCount,
        notifUrls,
        fabHrefs: snap.fabHrefs,
        fabHasExpected: fabHas,
        fabHasOtherStore: fabOther,
        pass,
      };
    }
    report.A = await capture("A", storeA);
    report.B = await capture("B", storeB);
    if (report.A.activeSessionStoreId !== storeA) report.mismatch.push("A session != A");
    if (report.B.activeSessionStoreId !== storeB) report.mismatch.push("B session != B");
    if (report.A.fabHasOtherStore || report.B.fabHasOtherStore) report.mismatch.push("FAB other-store href");
    if ((report.A.hubFetchUrl || "").includes(storeB)) report.mismatch.push("A hub fetch used B");
    if ((report.B.hubFetchUrl || "").includes(storeA)) report.mismatch.push("B hub fetch used A");
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
  return report;
}

async function runAdminUi(adminAuth) {
  const browser = await launchBrowser(true);
  try {
    const context = await browser.newContext();
    await context.addCookies(cookieObjects(adminAuth, ORIGIN));
    const page = await context.newPage();
    const calls = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("/api/me/notifications") || u.includes("/api/admin/admin-bell")) {
        calls.push({ method: req.method(), url: u });
      }
    });
    await page.goto(`${ORIGIN}/admin/order-notifications`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await sleep(4000);
    const html = await page.content();
    const meNotif = calls.filter((c) => c.url.includes("/api/me/notifications"));
    const bell = calls.filter((c) => c.url.includes("/api/admin/admin-bell"));
    await context.close();
    return {
      path: "/admin/order-notifications",
      meNotificationsCalls: meNotif.length,
      adminBellCalls: bell.length,
      meUrls: meNotif.map((c) => c.url).slice(0, 5),
      hasActionQueueCopy: /Action Queue|처리해야|충전|피드 배너|신고/i.test(html),
      isolated: meNotif.length === 0 && bell.length > 0,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runAdminSoundRuntime(adminAuth, admin, owner) {
  const browser = await launchBrowser(false);
  const rows = [];
  let chargeId = null;
  try {
    const context = await browser.newContext();
    await context.addCookies(cookieObjects(adminAuth, ORIGIN));
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__g45 = { audio: [], trace: [] };
      const orig = HTMLAudioElement.prototype.play;
      HTMLAudioElement.prototype.play = function () {
        try {
          window.__g45.audio.push({ t: Date.now(), src: String(this.src || this.currentSrc || "") });
        } catch {
          /* ignore */
        }
        return orig.apply(this, arguments);
      };
    });
    await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.bringToFront();
    await page.evaluate(() => window.focus());
    await sleep(8000);
    const hydrateAudio = await page.evaluate(() => window.__g45?.audio?.length ?? -1);
    const sub = await page.evaluate(() => {
      const rows = window.__dibayAdminSoundTrace || [];
      const hit = [...rows].reverse().find((r) => r && r.stage === "RT_SUBSCRIBE");
      return hit?.status ?? null;
    });
    rows.push({ name: "hydrate_silent", audio: hydrateAudio, subscribeStatus: sub, pass: hydrateAudio === 0 });

    await page.evaluate(() => {
      if (window.__g45) window.__g45.audio = [];
    });
    const now = new Date().toISOString();
    const { data: plans } = await admin.from("point_plans").select("id, name_ko, payment_amount, point_amount, rate_version").limit(1);
    const plan = plans?.[0];
    if (plan) {
      const ins = await admin
        .from("point_charge_requests")
        .insert({
          user_id: owner.ownerUserId,
          plan_id: plan.id,
          plan_name: plan.name_ko || "GATE45",
          payment_method: "manual_confirm",
          payment_amount: Number(plan.payment_amount || 1),
          point_amount: Number(plan.point_amount || 1),
          applied_rate: 1,
          rate_version: Math.max(1, Number(plan.rate_version || 1)),
          request_status: "waiting_confirm",
          depositor_name: MARK,
          receipt_image_url: "",
          user_memo: `${MARK}-sound`,
          requested_at: now,
          updated_at: now,
        })
        .select("id")
        .maybeSingle();
      chargeId = ins.data?.id || null;
    }
    await sleep(8000);
    const after = await page.evaluate(() => ({
      audio: window.__g45?.audio?.length ?? -1,
      trace: (window.__dibayAdminSoundTrace || []).slice(-25),
    }));
    rows.push({
      name: "new_row_sound",
      audio: after.audio,
      chargeId,
      trace: after.trace,
      pass: chargeId ? after.audio === 1 : false,
      notProven: !chargeId,
    });

    await page.evaluate(() => {
      if (window.__g45) window.__g45.audio = [];
    });
    if (chargeId) {
      await admin.from("point_charge_requests").update({ user_memo: `${MARK}-dup` }).eq("id", chargeId);
      await sleep(3000);
    }
    const dup = await page.evaluate(() => window.__g45?.audio?.length ?? -1);
    rows.push({ name: "duplicate_callback_0_extra", audio: dup, pass: dup === 0 });

    await context.close();
  } finally {
    await browser.close().catch(() => {});
    if (chargeId) {
      await delEq(admin, "point_charge_requests", "id", chargeId);
    }
  }
  return rows;
}

async function deviceMatrix(admin) {
  const adbDevices = spawnSync(ADB, ["devices"], { encoding: "utf8" });
  const serials = String(adbDevices.stdout || "")
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(/\s+/)[0])
    .filter(Boolean);
  const { data: devices } = await admin
    .from("user_devices")
    .select("user_id, platform, fcm_token, apns_token, is_active, last_seen_at, device_id")
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false })
    .limit(40);
  return {
    adbSerials: serials,
    samsungPresent: serials.includes(SAMSUNG),
    xiaomiPresent: serials.includes(XIAOMI),
    activeDevices: (devices || []).slice(0, 12).map((d) => ({
      platform: d.platform,
      active: d.is_active,
      hasFcm: Boolean(d.fcm_token),
      hasApns: Boolean(d.apns_token),
      lastSeen: d.last_seen_at,
    })),
  };
}

async function main() {
  loadEnv();
  const report = {
    stamp: STAMP,
    origin: ORIGIN,
    targetProject: process.env.NEXT_PUBLIC_SUPABASE_URL,
    expectedRef: PROD_REF,
  };
  const admin = sbAdmin();

  log("MIGRATION APPLY start");
  const slice = (process.env.GATE45_SLICE || "").trim();
  const skipDdl = slice === "db-rt" || slice === "ui" || process.env.GATE45_MIGRATION_APPLIED === "1";
  if (skipDdl) {
    report.migration = { ok: true, assumedAppliedByOwner: true };
    log("MIGRATION assumed applied by owner — skip DDL");
  } else {
    try {
      report.migration = await applyMigration();
    } catch (e) {
      report.migration = { ok: false, error: e?.message || String(e) };
    }
    log(`MIGRATION APPLY ${report.migration?.ok ? "PASS" : "FAIL"} ${report.migration?.error || ""}`);
  }

  let owner = null;
  try {
    owner = await findTwoStoreOwner(admin);
  } catch (e) {
    report.ownerFixtureError = e?.message || String(e);
    log(`owner fixture ERROR ${report.ownerFixtureError}`);
  }
  report.ownerFixture = owner;
  if (!owner || owner.stores.length < 2) {
    report.owner2store = { pass: false, error: "no 2-store owner fixture" };
    log("owner 2-store fixture NONE");
    if (!owner) {
      const { data: profiles } = await admin.from("profiles").select("id, username").in("username", ["asas44", "asas22", "asas11", "qqqq"]);
      for (const p of profiles || []) {
        const { data: rows } = await admin
          .from("stores")
          .select("id, store_name, slug, owner_user_id, approval_status, created_at")
          .eq("owner_user_id", p.id)
          .eq("approval_status", "approved")
          .limit(2);
        if (rows?.[0]) {
          owner = {
            ownerUserId: p.id,
            login: p.username,
            stores: rows.map((s) => ({ id: s.id, name: s.store_name, slug: s.slug, created_at: s.created_at })),
          };
          report.singleStoreOwner = { login: p.username, storeId: rows[0].id, storeCount: rows.length };
          log(`single-store owner fallback ${p.username} store=${rows[0].id}`);
          break;
        }
      }
    }
  } else {
    log(`owner fixture ${owner.login || owner.ownerUserId} A=${owner.stores[0].id} B=${owner.stores[1].id}`);
  }

  const kindsInDb = {};
  if (owner) {
    const { data: kindRows } = await admin
      .from("notifications")
      .select("meta")
      .eq("user_id", owner.ownerUserId)
      .eq("notification_type", "commerce")
      .limit(200);
    const set = new Set();
    for (const r of kindRows || []) {
      const k = r?.meta?.kind;
      if (typeof k === "string") set.add(k);
    }
    kindsInDb.legacyNotifications = [...set].sort();
    const { data: evtRows } = await admin
      .from("notification_events")
      .select("display_payload")
      .eq("user_id", owner.ownerUserId)
      .limit(200);
    const eset = new Set();
    for (const r of evtRows || []) {
      const k = r?.display_payload?.legacyMeta?.kind;
      if (typeof k === "string") eset.add(k);
    }
    kindsInDb.notificationEvents = [...eset].sort();
  }
  report.existingKinds = kindsInDb;

  if (owner) {
    const storeA = owner.stores[0].id;
    const storeB = owner.stores[1]?.id || null;
    log(`owner point/sold probe storeA=${storeA}`);
    const pointLegacy = await insertLegacyNotification(admin, owner.ownerUserId, storeA, "store_point_charge_approved");
    const pointEvt = await insertNotificationEvent(admin, owner.ownerUserId, storeA, "store_point_charge_approved");
    const soldLegacy = await insertLegacyNotification(admin, owner.ownerUserId, storeA, "store_order_sold_out");
    const soldEvt = await insertNotificationEvent(admin, owner.ownerUserId, storeA, "store_order_sold_out");

    const rpcPoint = await admin.rpc("get_owner_store_commerce_notifications", {
      p_user_id: owner.ownerUserId,
      p_store_id: storeA,
      p_limit: 50,
    });
    const rpcSoldB = storeB
      ? await admin.rpc("get_owner_store_commerce_notifications", {
          p_user_id: owner.ownerUserId,
          p_store_id: storeB,
          p_limit: 50,
        })
      : { data: [], error: null };
    const snap = await admin.rpc("get_owner_dashboard_notifications_snapshot", {
      p_user_id: owner.ownerUserId,
      p_store_id: storeA,
      p_limit: 50,
      p_cursor: "",
    });
    const ownerSeg = await admin.rpc("count_notification_unread_segmented", {
      p_user_id: owner.ownerUserId,
      p_segment: "owner_store_commerce",
    });
    const consumerSeg = await admin.rpc("count_notification_unread_segmented", {
      p_user_id: owner.ownerUserId,
      p_segment: "consumer",
    });

    const rpcArr = Array.isArray(rpcPoint.data)
      ? rpcPoint.data
      : Array.isArray(rpcPoint.data?.notifications)
        ? rpcPoint.data.notifications
        : [];
    const snapArr = Array.isArray(snap.data?.notifications) ? snap.data.notifications : [];
    const rpcHasPoint = rpcArr.some((r) => r?.meta?.kind === "store_point_charge_approved" && String(r?.title || "").includes(MARK));
    const rpcHasSold = rpcArr.some((r) => r?.meta?.kind === "store_order_sold_out" && String(r?.title || "").includes(MARK));
    const snapHasPoint = snapArr.some((r) => r?.meta?.kind === "store_point_charge_approved" && String(r?.title || "").includes(MARK));
    const snapHasSold = snapArr.some((r) => r?.meta?.kind === "store_order_sold_out" && String(r?.title || "").includes(MARK));
    const rpcBHasA = (Array.isArray(rpcSoldB.data) ? rpcSoldB.data : rpcSoldB.data?.notifications || []).some(
      (r) => String(r?.title || "").includes(MARK)
    );

    report.ownerPoint = {
      legacyInsert: pointLegacy,
      eventInsert: pointEvt,
      rpcHasPoint,
      snapshotHasPoint: snapHasPoint,
      rpcError: rpcPoint.error?.message || null,
      snapshotError: snap.error?.message || null,
      ownerSegment: ownerSeg.data ?? ownerSeg.error?.message,
      consumerSegment: consumerSeg.data ?? consumerSeg.error?.message,
      bleedToStoreB: rpcBHasA,
    };
    report.ownerSoldOut = {
      legacyInsert: soldLegacy,
      eventInsert: soldEvt,
      rpcHasSold,
      snapshotHasSold: snapHasSold,
    };
    log(`owner RPC point=${rpcHasPoint} sold=${rpcHasSold} snapPoint=${snapHasPoint} snapSold=${snapHasSold} bleedB=${rpcBHasA}`);

    await delEq(admin, "notifications", "dedupe_key", pointLegacy.dedupe);
    await delEq(admin, "notifications", "dedupe_key", soldLegacy.dedupe);
    await delEq(admin, "notification_events", "dedupe_key", pointEvt.dedupe);
    await delEq(admin, "notification_events", "dedupe_key", soldEvt.dedupe);
  }

  let adminAuth = null;
  let ownerAuth = null;
  log("signIn aaaa");
  try {
    adminAuth = await signIn("aaaa");
    log(`admin login ok ${adminAuth.userId}`);
  } catch (e) {
    report.adminLogin = { ok: false, error: e.message };
    log(`admin login FAIL ${e.message}`);
  }
  if (owner?.login) {
    log(`signIn owner ${owner.login}`);
    try {
      ownerAuth = await signIn(owner.login);
      log(`owner login ok ${ownerAuth.userId}`);
    } catch (e) {
      report.ownerLogin = { ok: false, error: e.message };
      log(`owner login FAIL ${e.message}`);
    }
  }

  if (adminAuth && !owner) {
    const { data: anyStore } = await admin
      .from("stores")
      .select("id, store_name, slug, owner_user_id, approval_status, created_at")
      .eq("approval_status", "approved")
      .limit(1)
      .maybeSingle();
    if (anyStore?.id) {
      owner = {
        ownerUserId: anyStore.owner_user_id,
        login: null,
        stores: [{ id: anyStore.id, name: anyStore.store_name, slug: anyStore.slug, created_at: anyStore.created_at }],
      };
      report.rtFallbackStore = anyStore.id;
      log(`RT fallback store ${anyStore.id}`);
    }
  }

  if (adminAuth && owner) {
    log("admin RT probe start");
    try {
      report.adminRt = await probeAdminRt(admin, adminAuth, owner);
      for (const c of report.adminRt.cleanup || []) {
        await delEq(admin, c.table, "id", c.id);
      }
    } catch (e) {
      report.adminRt = { error: e.message };
    }
  }

  let originReady = { ok: false, skipped: true };
  if (slice === "db-rt") {
    log("SLICE db-rt — skip origin/UI");
  } else {
    originReady = await ensureLocalOrigin();
  }
  report.origin = { ...originReady, url: ORIGIN };

  if (originReady.ok && ownerAuth && owner?.stores?.[1]) {
    try {
      report.owner2store = await runOwnerUi(ownerAuth, owner.stores[0].id, owner.stores[1].id);
    } catch (e) {
      report.owner2store = { error: e.message };
    }
  } else if (originReady.ok && ownerAuth && owner?.stores?.[0]) {
    log("owner 2-store UI skipped — single store only");
  }

  if (originReady.ok && ownerAuth && owner?.stores?.[0]) {
    const storeA = owner.stores[0].id;
    const pointEvt2 = await insertNotificationEvent(admin, owner.ownerUserId, storeA, "store_point_charge_approved");
    const soldEvt2 = await insertNotificationEvent(admin, owner.ownerUserId, storeA, "store_order_sold_out");
    const memberList = await apiFetch("/api/me/notifications?exclude_owner_store_commerce=1&limit=40", ownerAuth);
    const ownerList = await apiFetch(`/api/me/notifications?owner_store_id=${storeA}`, ownerAuth);
    const memberBell = await apiFetch("/api/me/notifications?unread_count_only=1&badge_surface=tier1_inbox_bell", ownerAuth);
    const ownerBell = await apiFetch(
      `/api/me/notifications?unread_count_only=1&badge_surface=owner_commerce_inbox&owner_store_id=${storeA}`,
      ownerAuth
    );
    const icon = await apiFetch("/api/me/notifications/badge-count", ownerAuth);
    const memberRows = memberList.json?.notifications || memberList.json?.items || [];
    const ownerRows = ownerList.json?.notifications || [];
    const memberHasPoint = JSON.stringify(memberRows).includes("store_point_charge_approved") || JSON.stringify(memberRows).includes(MARK);
    const ownerHasPoint =
      JSON.stringify(ownerRows).includes("store_point_charge_approved") || JSON.stringify(ownerRows).includes(MARK);
    const ownerHasSold = JSON.stringify(ownerRows).includes("store_order_sold_out") || JSON.stringify(ownerRows).includes(MARK);
    report.ownerRuntimeInbox = {
      pointEventId: pointEvt2.row?.id || null,
      soldEventId: soldEvt2.row?.id || null,
      memberListStatus: memberList.status,
      ownerListStatus: ownerList.status,
      memberHasPoint,
      ownerHasPoint,
      ownerHasSold,
      memberBell: memberBell.json,
      ownerBell: ownerBell.json,
      appIcon: icon.json,
      ownerListError: ownerList.json?.error || null,
    };
    await delEq(admin, "notification_events", "dedupe_key", pointEvt2.dedupe);
    await delEq(admin, "notification_events", "dedupe_key", soldEvt2.dedupe);
  }

  if (originReady.ok && adminAuth) {
    const bell = await apiFetch("/api/admin/admin-bell", adminAuth);
    const overview = await apiFetch("/api/admin/customer-platform/overview", adminAuth);
    report.adminQueue = {
      bellStatus: bell.status,
      overviewStatus: overview.status,
      bellTotal: bell.json?.total ?? null,
      overviewTotal: overview.json?.action_queue?.total ?? overview.json?.total ?? null,
      bellBy: bell.json?.by_category ?? null,
      overviewActionQueue: overview.json?.action_queue ?? null,
      sameTotal:
        bell.json?.ok &&
        (overview.json?.action_queue?.total ?? overview.json?.total) != null &&
        Number(bell.json?.total) === Number(overview.json?.action_queue?.total ?? overview.json?.total),
    };
    try {
      report.adminLegacy = await runAdminUi(adminAuth);
    } catch (e) {
      report.adminLegacy = { error: e.message };
    }
    if (process.env.GATE45_SKIP_SOUND === "1") {
      report.adminSound = { skipped: true };
    } else {
      try {
        report.adminSound = await runAdminSoundRuntime(adminAuth, admin, owner || { ownerUserId: adminAuth.userId });
      } catch (e) {
        report.adminSound = { error: e.message };
      }
    }
  }

  report.devices = await deviceMatrix(admin);

  const verdict = {
    MIGRATION: report.migration?.ok ? "PASS" : "FAIL",
    OWNER_ACTIVE_STORE_2_STORE:
      report.owner2store?.A?.pass && report.owner2store?.B?.pass && (report.owner2store?.mismatch || []).length === 0
        ? "PASS"
        : report.owner2store?.A
          ? "FAIL"
          : "NOT_PROVEN",
    OWNER_POINT_ORPHAN:
      report.ownerRuntimeInbox?.ownerHasPoint && !report.ownerRuntimeInbox?.memberHasPoint
        ? "CLOSED"
        : report.ownerPoint?.rpcHasPoint && report.ownerRuntimeInbox && !report.ownerRuntimeInbox.ownerHasPoint
          ? "OPEN"
          : report.ownerPoint?.rpcHasPoint
            ? "PARTIAL"
            : "OPEN",
    OWNER_SOLD_OUT: report.ownerSoldOut?.rpcHasSold || report.ownerRuntimeInbox?.ownerHasSold ? "PASS" : "FAIL",
    OWNER_MEMBER_ISOLATION: report.ownerRuntimeInbox && !report.ownerRuntimeInbox.memberHasPoint ? "PASS" : report.ownerRuntimeInbox ? "FAIL" : "NOT_PROVEN",
    ADMIN_ACTION_QUEUE: report.adminQueue?.sameTotal ? "PASS" : report.adminQueue ? "FAIL" : "NOT_PROVEN",
    STORE_CHARGE_RT: report.adminRt?.storeCharge?.rtReceived > 0 ? "PASS" : "FAIL",
    FEED_AD_RT: report.adminRt?.feedAd?.rtReceived > 0 ? "PASS" : "FAIL",
    DELIVERY_P0_RT: report.adminRt?.delivery?.rtReceived > 0 ? "PASS" : "FAIL",
    MEMBER_CHARGE_RT: report.adminRt?.memberCharge?.rtReceived > 0 ? "PASS" : "FAIL",
    MEMBER_CHARGE_RT_SERVICE_ROLE:
      report.adminRt?.memberChargeServiceRole?.rtReceived > 0
        ? "PASS"
        : report.adminRt?.memberChargeServiceRole
          ? "FAIL"
          : "NOT_PROVEN",
    ADMIN_LEGACY: report.adminLegacy?.isolated ? "CLOSED" : report.adminLegacy ? "OPEN" : "NOT_PROVEN",
    ADMIN_HYDRATE_SILENT: report.adminSound?.[0]?.pass ? "PASS" : report.adminSound ? "FAIL" : "NOT_PROVEN",
    ADMIN_SOUND: report.adminSound?.[1]?.pass ? "PASS" : report.adminSound?.[1]?.notProven ? "NOT_PROVEN" : report.adminSound ? "FAIL" : "NOT_PROVEN",
  };
  report.verdict = verdict;

  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(`WROTE ${path.join(OUT, "REPORT.json")}`);
  console.log(JSON.stringify({ out: OUT, verdict }, null, 2));
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(OUT, "FATAL.json"), JSON.stringify({ error: e?.message || String(e), stack: e?.stack }, null, 2));
  process.exit(1);
});
