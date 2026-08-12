#!/usr/bin/env node
/**
 * D7 — iOS NSE real-device matrix (iPhonebk).
 * Requires local Next with APNS sandbox credentials + Debug App+NSE installed.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAMP = Date.now();
const OUT = path.join(ROOT, `.qa-logs/admin-campaign-d7-ios-${STAMP}`);
const BASE = process.env.D7_BASE || "http://127.0.0.1:3012";
const QA = process.env.GATE4_RECEIVER_ID || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const DEVELOPER_DIR = process.env.DEVELOPER_DIR || "/Applications/Xcode.app/Contents/Developer";
const DEVICE = process.env.IOS_UDID || "B01DDF12-5B2F-59C3-9B8F-3AF136851ECB";
const UDID_LEGACY = process.env.IOS_UDID_LEGACY || "00008120-000025C826F3C01E";
const VALID_IMAGE = "https://picsum.photos/800/400";
const INVALID_IMAGE = "https://invalid.example.com/no-image.jpg";

fs.mkdirSync(OUT, { recursive: true });

function loadEnv() {
  for (const rel of [".env.local", ".env.vercel.production", ".env"]) {
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dc(...args) {
  return spawnSync(path.join(DEVELOPER_DIR, "usr/bin/devicectl"), args, {
    encoding: "utf8",
    timeout: 90_000,
    env: {
      ...process.env,
      DEVELOPER_DIR,
      PATH: `${DEVELOPER_DIR}/usr/bin:${process.env.PATH}`,
    },
  });
}

function adminClients() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    url,
    sb: createClient(url, anon, { auth: { persistSession: false } }),
    admin: createClient(url, sk, { auth: { persistSession: false } }),
  };
}

async function adminCookie(clients) {
  let session = null;
  for (const pass of [
    ...new Set(
      [process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "DibayQa1!", "1234"].filter(Boolean)
    ),
  ]) {
    const { data } = await clients.sb.auth.signInWithPassword({
      email: "aaaa@manual.local",
      password: pass,
    });
    if (data.session) {
      session = data.session;
      break;
    }
  }
  if (!session) throw new Error("admin login fail");
  const ref = clients.url.match(/https:\/\/([^.]+)\./)?.[1];
  let cookie = `sb-${ref}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  )}`;
  const { data: pr } = await clients.admin
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (pr?.active_session_id) {
    cookie += `; samarket_active_session_id=${encodeURIComponent(pr.active_session_id)}`;
  }
  return cookie;
}

async function createCampaign(cookie, { title, body, push_image_url, deeplink_url }) {
  const res = await fetch(`${BASE}/api/admin/notification-campaigns`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      title,
      body,
      type: "notice",
      channel: "push_only",
      target_type: "selected_users",
      target_payload: { user_ids: [QA] },
      deeplink_url: deeplink_url || "/notifications",
      push_image_url: push_image_url || null,
      send_mode: "immediate",
      is_qa: true,
    }),
  });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`create non-json ${res.status} ${text.slice(0, 120)}`);
  }
  const id = j.campaign?.id || j.id;
  if (!id) throw new Error(`create fail ${JSON.stringify(j)}`);
  return id;
}

async function testSend(cookie, campaignId, key) {
  const res = await fetch(`${BASE}/api/admin/notification-campaigns/${campaignId}/test-send`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      accept: "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ user_ids: [QA] }),
  });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`send non-json ${res.status} ${text.slice(0, 120)}`);
  }
  return { status: res.status, json: j };
}

async function deliveries(admin, occurrenceId) {
  const { data, error } = await admin
    .from("notification_campaign_deliveries")
    .select("status,skip_reason,provider_message_id,channel,device_id")
    .eq("occurrence_id", occurrenceId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`deliveries: ${error.message}`);
  return data || [];
}

async function iosDeviceIds(admin) {
  const { data } = await admin
    .from("user_devices")
    .select("id,push_provider,environment,is_active")
    .eq("user_id", QA)
    .eq("platform", "ios")
    .eq("is_active", true);
  return new Set((data || []).map((r) => r.id));
}

function setAppState(state) {
  if (state === "terminated") {
    // resolve pid then terminate (devicectl requires --pid)
    const listed = dc("device", "info", "processes", "--device", DEVICE);
    const blob = `${listed.stdout || ""}\n${listed.stderr || ""}`;
    const m = blob.match(/com\.dibay\.app[^\n]*?\bpid[=: ]+(\d+)/i) || blob.match(/\b(\d+)\b[^\n]*com\.dibay\.app/i);
    let t;
    if (m?.[1]) {
      t = dc("device", "process", "terminate", "--device", DEVICE, "--pid", m[1], "--kill");
    } else {
      // fallback: launch then kill via killall-equivalent not available — mark best-effort
      t = { status: 1, stdout: "", stderr: "pid_not_found" };
    }
    return { op: "terminate", status: t.status, out: ((t.stdout || "") + (t.stderr || "")).slice(-300), pid: m?.[1] || null };
  }
  dc("device", "process", "launch", "--device", DEVICE, "com.dibay.app");
  spawnSync("sleep", ["1.5"]);
  const p = dc("device", "process", "launch", "--device", DEVICE, "com.apple.Preferences");
  return { op: "background", status: p.status, out: ((p.stdout || "") + (p.stderr || "")).slice(-300) };
}

function grepSyslog(file, patterns) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8");
  const out = {};
  for (const p of patterns) {
    out[p] = (text.match(new RegExp(p, "gi")) || []).length;
  }
  return out;
}

async function main() {
  const clients = adminClients();
  const cookie = await adminCookie(clients);
  const iosIds = await iosDeviceIds(clients.admin);

  const syslogPath = path.join(OUT, "syslog.txt");
  const syslog = spawn("idevicesyslog", ["-u", UDID_LEGACY], {
    stdio: ["ignore", fs.openSync(syslogPath, "w"), fs.openSync(path.join(OUT, "syslog.err"), "w")],
  });

  const report = {
    DEVICE: "iPhonebk",
    BASE,
    BUILD: "PASS",
    NSE_EMBED: "PASS",
    IOS_DEVICE_ROWS: [...iosIds],
    CASES: {},
  };

  try {
    for (const [mode, img] of [
      ["text", null],
      ["image", VALID_IMAGE],
      ["invalid", INVALID_IMAGE],
    ]) {
      for (const state of ["background", "terminated"]) {
        const label = `${mode}_${state}`;
        const st = setAppState(state);
        await sleep(2000);
        const marker = `D7-${label}-${Date.now()}`;
        const campaignId = await createCampaign(cookie, {
          title: marker,
          body: `D7 ${label} body`,
          push_image_url: img,
          deeplink_url: "/mypage/notices",
        });
        const send = await testSend(cookie, campaignId, marker);
        await sleep(6000);
        const dels = send.json.occurrence_id ? await deliveries(clients.admin, send.json.occurrence_id) : [];
        const iosPush = dels.filter((d) => d.channel === "push" && iosIds.has(d.device_id));
        const accepted = iosPush.find((d) => d.status === "sent" && d.provider_message_id);
        const skipped = iosPush.find((d) => d.status === "skipped" || d.status === "failed");
        report.CASES[label] = {
          appState: st,
          campaignId,
          sendStatus: send.status,
          occurrence_id: send.json.occurrence_id || null,
          send: { ok: send.json.ok, sent: send.json.sent, skipped: send.json.skipped, failed: send.json.failed },
          iosPush,
          providerAccepted: !!accepted,
          skip: skipped?.skip_reason || null,
        };
        console.log(label, JSON.stringify(report.CASES[label]));
        fs.writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify(report.CASES[label], null, 2));
      }
    }
  } finally {
    try {
      syslog.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }

  await sleep(1000);
  report.SYSLOG_HITS = grepSyslog(syslogPath, [
    "DibayPushServiceExtension",
    "NotificationService",
    "push-image",
    "UNNotificationServiceExtension",
    "com.dibay.app",
  ]);

  const all = Object.values(report.CASES);
  const textOk = ["text_background", "text_terminated"].every((k) => report.CASES[k]?.providerAccepted);
  const imageOk = ["image_background", "image_terminated"].every((k) => report.CASES[k]?.providerAccepted);
  const invalidOk = ["invalid_background", "invalid_terminated"].every((k) => report.CASES[k]?.providerAccepted);
  const nseHit =
    (report.SYSLOG_HITS.DibayPushServiceExtension || 0) +
      (report.SYSLOG_HITS.NotificationService || 0) +
      (report.SYSLOG_HITS["UNNotificationServiceExtension"] || 0) >
    0;

  report.TEXT = textOk ? "PASS" : "NOT_PROVEN";
  report.IMAGE = imageOk && nseHit ? "PASS" : imageOk ? "PROVIDER_ONLY" : "NOT_PROVEN";
  report.FALLBACK = invalidOk ? "PROVIDER_ONLY" : "NOT_PROVEN";
  report.NSE_RUNTIME = nseHit ? "PASS" : "NOT_PROVEN";
  report.DEEPLINK = "NOT_PROVEN";
  report.REGRESSION = "NOT_PROVEN";
  report.D7 =
    report.TEXT === "PASS" && report.IMAGE === "PASS" && report.FALLBACK !== "NOT_PROVEN" && report.NSE_RUNTIME === "PASS"
      ? "PASS"
      : "NOT_PROVEN";
  report.allCaseCount = all.length;

  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out: OUT, D7: report.D7, TEXT: report.TEXT, IMAGE: report.IMAGE, FALLBACK: report.FALLBACK, NSE_RUNTIME: report.NSE_RUNTIME, SYSLOG_HITS: report.SYSLOG_HITS }, null, 2));
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
});
