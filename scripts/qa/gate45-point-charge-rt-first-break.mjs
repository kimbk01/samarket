#!/usr/bin/env node
/**
 * GATE 4.5 — point_charge_requests RT FIRST BREAK
 * Do not ALTER replica identity. Do not poll-sound workaround.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, `.qa-logs/gate45-pcr-first-break-${new Date().toISOString().replace(/[:.]/g, "-")}`);
fs.mkdirSync(OUT, { recursive: true });
const MARK = `G45PCR-${Date.now().toString(36)}`;

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function log(line) {
  const msg = `[pcr-fb] ${line}`;
  console.log(msg);
  fs.appendFileSync(path.join(OUT, "run.log"), msg + "\n");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function passwords() {
  return [...new Set([process.env.E2E_ADMIN_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_TEST_PASSWORD, "DibayQa1!", "1234"].filter(Boolean))];
}

async function signIn(login) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const emails = [`${login}@manual.local`, `${login}@samarket.local`];
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const email of emails) {
    for (const pass of passwords()) {
      const r = await Promise.race([
        sb.auth.signInWithPassword({ email, password: pass }),
        sleep(8000).then(() => ({ data: null, error: { message: "timeout" } })),
      ]);
      if (r.data?.session) return r.data.session;
    }
  }
  throw new Error(`login fail ${login}`);
}

function clientAnonJwt(jwt) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clientServiceKey() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function listenStar(label, sb, jwtForSetAuth, table, runMutations) {
  if (jwtForSetAuth) await sb.realtime.setAuth(jwtForSetAuth);
  const received = [];
  const channel = sb.channel(`pcr-${label}-${Date.now()}`);
  channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
    received.push({
      t: Date.now(),
      eventType: payload?.eventType ?? null,
      id: payload?.new?.id ?? payload?.old?.id ?? null,
    });
  });
  const sub = await Promise.race([
    new Promise((resolve) => {
      channel.subscribe((s, err) => {
        if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          resolve({ s, err: err?.message || null });
        }
      });
    }),
    sleep(8000).then(() => ({ s: "TIMEOUT", err: null })),
  ]);
  log(`${label} subscribe=${sub.s} err=${sub.err || "none"}`);
  const mut = await runMutations();
  const t0 = Date.now();
  while (Date.now() - t0 < 7000) {
    if (received.some((r) => r.eventType === "INSERT") && received.some((r) => r.eventType === "UPDATE")) break;
    await sleep(120);
  }
  try {
    await sb.removeChannel(channel);
  } catch {
    /* ignore */
  }
  return {
    label,
    subscribe: sub.s,
    mut,
    received,
    insertRt: received.filter((r) => r.eventType === "INSERT").length,
    updateRt: received.filter((r) => r.eventType === "UPDATE").length,
    deleteRt: received.filter((r) => r.eventType === "DELETE").length,
  };
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] || "";
  if (ref !== "ckdosyydvgzqwpbwuhon") throw new Error(`wrong project ${ref}`);

  const sr = clientServiceKey();
  const adminSession = await signIn("aaaa");
  const memberSession = await signIn("qqqq");
  log(`admin=${adminSession.user.id} member=${memberSession.user.id}`);

  const { data: plan } = await sr.from("point_plans").select("id, name_ko, payment_amount, point_amount, rate_version").limit(1).maybeSingle();
  if (!plan?.id) throw new Error("no point_plans");

  async function insertRow(memo) {
    const now = new Date().toISOString();
    const ins = await sr
      .from("point_charge_requests")
      .insert({
        user_id: memberSession.user.id,
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
        user_memo: memo,
        requested_at: now,
        updated_at: now,
      })
      .select("id")
      .maybeSingle();
    return { id: ins.data?.id || null, error: ins.error?.message || null };
  }

  async function updateRow(id, memo) {
    const u = await sr.from("point_charge_requests").update({ user_memo: memo, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
    return { id: u.data?.id || null, error: u.error?.message || null };
  }

  async function restSelect(label, sb) {
    const { data, error, count } = await sb
      .from("point_charge_requests")
      .select("id", { count: "exact" })
      .eq("user_memo", `${MARK}-rest`)
      .limit(5);
    return { label, count: count ?? (data || []).length, error: error?.message || null, ids: (data || []).map((r) => r.id) };
  }

  const restSeed = await insertRow(`${MARK}-rest`);
  log(`rest seed id=${restSeed.id} err=${restSeed.error || "none"}`);

  const adminSb = clientAnonJwt(adminSession.access_token);
  const memberSb = clientAnonJwt(memberSession.access_token);
  const restAdmin = await restSelect("admin_jwt_rest", adminSb);
  const restMember = await restSelect("member_jwt_rest", memberSb);
  const restSr = await restSelect("service_key_rest", sr);
  log(`REST admin count=${restAdmin.count} err=${restAdmin.error || "none"}`);
  log(`REST member count=${restMember.count} err=${restMember.error || "none"}`);
  log(`REST service count=${restSr.count} err=${restSr.error || "none"}`);

  const controlStore = await listenStar("CTRL_store_point_admin_jwt", clientAnonJwt(adminSession.access_token), adminSession.access_token, "store_point_charge_requests", async () => {
    const { data: stores } = await sr.from("stores").select("id, owner_user_id").eq("owner_user_id", memberSession.user.id).eq("approval_status", "approved").limit(1);
    const store = stores?.[0];
    if (!store) return { insert: { id: null, error: "no store" }, update: null };
    const ins = await sr
      .from("store_point_charge_requests")
      .insert({
        store_id: store.id,
        owner_user_id: store.owner_user_id,
        payment_method: "manual_confirm",
        payment_amount: 1,
        point_amount: 1,
        request_status: "pending",
        depositor_name: MARK,
        bank_name: "",
        receipt_image_url: "",
        user_memo: `${MARK}-ctrl`,
      })
      .select("id")
      .maybeSingle();
    const id = ins.data?.id || null;
    if (id) {
      await sr.from("store_point_charge_requests").update({ user_memo: `${MARK}-ctrl-u` }).eq("id", id);
    }
    return { insert: { id, error: ins.error?.message || null }, update: { id } };
  });

  const pcrAdmin = await listenStar("PCR_admin_jwt", clientAnonJwt(adminSession.access_token), adminSession.access_token, "point_charge_requests", async () => {
    const ins = await insertRow(`${MARK}-admin-rt`);
    if (ins.id) await updateRow(ins.id, `${MARK}-admin-rt-u`);
    return { insert: ins, update: ins.id };
  });

  const pcrMember = await listenStar("PCR_member_owner_jwt", clientAnonJwt(memberSession.access_token), memberSession.access_token, "point_charge_requests", async () => {
    const ins = await insertRow(`${MARK}-member-rt`);
    if (ins.id) await updateRow(ins.id, `${MARK}-member-rt-u`);
    return { insert: ins, update: ins.id };
  });

  const pcrServiceKey = await listenStar("PCR_service_role_KEY", clientServiceKey(), null, "point_charge_requests", async () => {
    const ins = await insertRow(`${MARK}-srkey-rt`);
    if (ins.id) await updateRow(ins.id, `${MARK}-srkey-rt-u`);
    return { insert: ins, update: ins.id };
  });

  const ids = [restSeed.id, controlStore.mut?.insert?.id, pcrAdmin.mut?.insert?.id, pcrMember.mut?.insert?.id, pcrServiceKey.mut?.insert?.id].filter(Boolean);
  for (const id of ids) {
    if (!id) continue;
    await sr.from("point_charge_requests").delete().eq("id", id);
    await sr.from("store_point_charge_requests").delete().eq("id", id);
  }

  let firstBreak = "UNKNOWN";
  if (controlStore.insertRt === 0 && controlStore.subscribe === "SUBSCRIBED") {
    firstBreak = "SUBSCRIBE_OR_WAL_BROKEN_EVEN_ON_WORKING_TABLE";
  } else if (restAdmin.count === 0 && restMember.count > 0) {
    firstBreak = "ADMIN_RLS_SELECT";
  } else if (pcrMember.insertRt > 0 && pcrAdmin.insertRt === 0) {
    firstBreak = "ADMIN_RLS_SELECT_ON_RT_ONLY";
  } else if (pcrServiceKey.insertRt > 0 && pcrAdmin.insertRt === 0) {
    firstBreak = "ADMIN_JWT_RT_AUTH_OR_RLS";
  } else if (pcrServiceKey.insertRt === 0 && pcrServiceKey.updateRt > 0) {
    firstBreak = "INSERT_WAL_OR_PUBINSERT_FALSE — replica identity still candidate, do not change yet";
  } else if (pcrServiceKey.updateRt === 0 && pcrServiceKey.insertRt === 0 && pcrServiceKey.subscribe === "SUBSCRIBED") {
    firstBreak = "PUBLICATION_OR_REPLICA_OR_REALTIME_SERVER — RLS eliminated if REST service select works";
  } else if (pcrAdmin.insertRt > 0) {
    firstBreak = "NONE_INSERT_NOW_WORKS";
  }

  const report = {
    mark: MARK,
    rest: { admin: restAdmin, member: restMember, service: restSr },
    controlStorePoint: { subscribe: controlStore.subscribe, insertRt: controlStore.insertRt, updateRt: controlStore.updateRt, mut: controlStore.mut },
    pcrAdminJwt: { subscribe: pcrAdmin.subscribe, insertRt: pcrAdmin.insertRt, updateRt: pcrAdmin.updateRt, received: pcrAdmin.received, mut: pcrAdmin.mut },
    pcrMemberJwt: { subscribe: pcrMember.subscribe, insertRt: pcrMember.insertRt, updateRt: pcrMember.updateRt, received: pcrMember.received, mut: pcrMember.mut },
    pcrServiceRoleKey: { subscribe: pcrServiceKey.subscribe, insertRt: pcrServiceKey.insertRt, updateRt: pcrServiceKey.updateRt, received: pcrServiceKey.received, mut: pcrServiceKey.mut },
    firstBreak,
  };
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(`FIRST_BREAK=${firstBreak}`);
  log(`WROTE ${path.join(OUT, "REPORT.json")}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(OUT, "FATAL.json"), JSON.stringify({ error: e.message, stack: e.stack }, null, 2));
  process.exit(1);
});
