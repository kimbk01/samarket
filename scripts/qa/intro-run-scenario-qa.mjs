#!/usr/bin/env node
/**
 * DIBAY Intro FINAL Scenario QA 01–17
 * Production Admin API + installed native cold starts.
 */
import { spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, ".tmp/intro-final-reconstruction/qa");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const PROD = process.env.INTRO_QA_BASE || "https://samarket.vercel.app";
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const IOS_UDID = "00008120-000025C826F3C01E";
const DEVICES = [
  { label: "samsung", serial: "RFCY40PY2CA", platform: "android" },
  { label: "xiaomi", serial: "8b37179f7d94", platform: "android" },
  { label: "iphonebk", serial: IOS_UDID, platform: "ios" },
];

const MARKER = `QA-FINAL-${Date.now().toString(36).toUpperCase()}`;
const SS_COLOR = "#0A4D8C";

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });
fs.mkdirSync(path.join(OUT, "logs"), { recursive: true });
fs.mkdirSync(path.join(OUT, "api"), { recursive: true });

const results = {};
const authority = {
  productionUrl: PROD,
  polledAt: new Date().toISOString(),
  deploymentId: null,
  deploymentStatus: null,
  expectedCommits: ["435cfd56b", "6493b0d18"],
  originMain: null,
  marker: MARKER,
  ssColor: SS_COLOR,
};

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
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeJson(rel, obj) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}

/**
 * C7 status authority:
 * - PASS = Owner-visible device acceptance only (never auto from API/log/token)
 * - API_OK = server/API contract support only (not product PASS)
 * - NOT_PROVEN = evidence incomplete / needs Owner eyes
 * - FAIL = contradicted
 * This runner must NOT mint product PASS or HARD LOCK from API alone.
 */
function setScenario(id, status, notes, evidence = []) {
  const allowed = new Set(["PASS", "FAIL", "NOT_PROVEN", "API_OK"]);
  if (!allowed.has(status)) {
    throw new Error(`invalid_scenario_status:${status}`);
  }
  results[id] = {
    id,
    status,
    notes: Array.isArray(notes) ? notes : [notes],
    evidence,
    at: new Date().toISOString(),
  };
  writeJson("SCENARIO_RESULTS.json", {
    authority,
    scenarios: results,
    updatedAt: new Date().toISOString(),
  });
  console.log(`[${id}] ${status} — ${(Array.isArray(notes) ? notes : [notes]).join("; ")}`);
}

/** API/log success → API_OK (never PASS). */
function apiStatus(ok) {
  return ok ? "API_OK" : "FAIL";
}

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function sh(cmd, opts = {}) {
  try {
    return {
      ok: true,
      out: execSync(cmd, {
        encoding: "utf8",
        timeout: opts.timeout ?? 60_000,
        maxBuffer: 20 * 1024 * 1024,
        ...opts,
      }),
    };
  } catch (e) {
    return {
      ok: false,
      out: (e.stdout || "") + (e.stderr || e.message || String(e)),
    };
  }
}

async function adminSession() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) throw new Error("missing_supabase_env");
  const adminLogin = process.env.E2E_ADMIN_USERNAME || "aaaa";
  const email = `${adminLogin}@manual.local`;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const passwords = [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean),
    ),
  ];
  for (const pass of passwords) {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error || !data.session) continue;
    const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
    const cookieName = ref ? `sb-${ref}-auth-token` : "sb-auth-token";
    let cookie = `${cookieName}=${encodeURIComponent(
      JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      }),
    )}`;
    if (sk) {
      const adminSb = createClient(url, sk, { auth: { persistSession: false } });
      const { data: pr } = await adminSb
        .from("profiles")
        .select("active_session_id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (pr?.active_session_id) {
        cookie += `; samarket_active_session_id=${encodeURIComponent(String(pr.active_session_id))}`;
      }
    }
    return {
      cookie,
      bearer: data.session.access_token,
      userId: data.session.user.id,
      email,
    };
  }
  throw new Error("admin_login_failed");
}

async function api(session, method, pathname, body, opts = {}) {
  const headers = {
    authorization: `Bearer ${session.bearer}`,
    cookie: session.cookie,
  };
  let payload = body;
  if (opts.formData) {
    payload = opts.formData;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${PROD}${pathname}`, {
    method,
    headers,
    body: payload,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 2000) };
  }
  const evidencePath = writeJson(
    `api/${method}_${pathname.replace(/\//g, "_").replace(/^_/, "")}_${Date.now()}.json`,
    { status: res.status, json, pathname, method },
  );
  return { status: res.status, json, evidencePath };
}

function ensureFixtures() {
  const dir = path.join(OUT, "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  const png = path.join(dir, "qa-marker.png");
  const png2 = path.join(dir, "qa-replace.png");
  const mp4 = path.join(dir, "qa-tiny.mp4");
  if (!fs.existsSync(png)) {
    sh(
      `ffmpeg -y -f lavfi -i color=c=0xE11D48:s=640x360 -frames:v 1 "${png}" 2>/dev/null`,
    );
  }
  if (!fs.existsSync(png2)) {
    sh(
      `ffmpeg -y -f lavfi -i color=c=0x16A34A:s=480x480 -frames:v 1 "${png2}" 2>/dev/null`,
    );
  }
  if (!fs.existsSync(mp4)) {
    sh(
      `ffmpeg -y -f lavfi -i color=c=0x1D4ED8:s=320x180:d=1 -f lavfi -i anullsrc=r=44100:cl=mono -shortest -c:v libx264 -pix_fmt yuv420p -t 1 "${mp4}" 2>/dev/null`,
    );
  }
  const gif = path.join(ROOT, "fixtures/intro/gif/01_normal_multiframe.gif");
  return { png, png2, mp4, gif: fs.existsSync(gif) ? gif : null };
}

async function uploadMedia(session, filePath, asLogo = false) {
  const buf = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  const ext = path.extname(name).toLowerCase();
  const type =
    ext === ".gif"
      ? "image/gif"
      : ext === ".mp4"
        ? "video/mp4"
        : ext === ".png"
          ? "image/png"
          : "application/octet-stream";
  const form = new FormData();
  form.append("file", new Blob([buf], { type }), name);
  if (asLogo) form.append("asLogo", "1");
  return api(session, "POST", "/api/admin/intro/media", undefined, {
    formData: form,
  });
}

function cryptoId() {
  return globalThis.crypto.randomUUID();
}

function defaultImageFrame(w = 640, h = 360) {
  // mirror containMediaFrame defaults
  const maxW = 0.82;
  const maxH = 0.55;
  const aspect = w / h;
  const boxAspect = maxW / maxH;
  let fw, fh;
  if (aspect > boxAspect) {
    fw = maxW;
    fh = maxW / aspect;
  } else {
    fh = maxH;
    fw = maxH * aspect;
  }
  return { x: (1 - fw) / 2, y: (1 - fh) / 2, w: fw, h: fh };
}

function buildDoc({
  title,
  markerText,
  mediaId,
  mediaW,
  mediaH,
  replaceMediaId,
  includeLogo,
  logoMediaId,
  includeCta,
  includeVideo,
  videoMediaId,
  transitions,
  motions,
  scenesExtra = 0,
}) {
  const frame = defaultImageFrame(mediaW || 640, mediaH || 360);
  const scene0 = {
    id: cryptoId(),
    name: "오프닝",
    durationMs: 3500,
    background: { type: "COLOR", color: "#0F172A" },
    transition: transitions?.[0] || { type: "CUT", durationMs: 0 },
    elements: [],
  };
  if (mediaId) {
    scene0.elements.push({
      id: cryptoId(),
      type: "IMAGE",
      frame,
      zIndex: 0,
      visible: true,
      opacity: 1,
      motion: motions?.[0] || { type: "FADE_IN", startMs: 0, durationMs: 400 },
      payload: { mediaId: replaceMediaId || mediaId, fit: "CONTAIN" },
    });
  }
  scene0.elements.push({
    id: cryptoId(),
    type: "TEXT",
    frame: { x: 0.08, y: 0.62, w: 0.84, h: 0.12 },
    zIndex: 2,
    visible: true,
    opacity: 1,
    motion: { type: "NONE", startMs: 0, durationMs: 0 },
    payload: {
      text: markerText,
      color: "#FFFFFF",
      fontSizeNorm: 0.04,
      align: "center",
      weight: "bold",
    },
  });
  if (includeLogo && logoMediaId) {
    scene0.elements.push({
      id: cryptoId(),
      type: "LOGO",
      frame: defaultImageFrame(200, 80),
      zIndex: 3,
      visible: true,
      opacity: 1,
      motion: { type: "SCALE_IN", startMs: 0, durationMs: 350 },
      payload: { mediaId: logoMediaId, fit: "CONTAIN" },
    });
  }
  if (includeCta) {
    scene0.elements.push({
      id: cryptoId(),
      type: "CTA",
      frame: { x: 0.2, y: 0.78, w: 0.6, h: 0.08 },
      zIndex: 4,
      visible: true,
      opacity: 1,
      motion: { type: "NONE", startMs: 0, durationMs: 0 },
      payload: {
        label: "시작하기",
        action: { type: "FINISH_INTRO" },
        backgroundColor: "#2563EB",
        textColor: "#FFFFFF",
      },
    });
  }
  if (includeVideo && videoMediaId) {
    scene0.elements.push({
      id: cryptoId(),
      type: "VIDEO",
      frame: defaultImageFrame(320, 180),
      zIndex: 1,
      visible: true,
      opacity: 1,
      motion: { type: "NONE", startMs: 0, durationMs: 0 },
      payload: {
        mediaId: videoMediaId,
        fit: "CONTAIN",
        loop: true,
        muted: true,
      },
    });
  }
  const scenes = [scene0];
  for (let i = 0; i < scenesExtra; i++) {
    scenes.push({
      id: cryptoId(),
      name: `장면 ${i + 2}`,
      durationMs: 2000,
      background: { type: "COLOR", color: i % 2 === 0 ? "#14532D" : "#7C2D12" },
      transition: transitions?.[i + 1] || {
        type: "FADE",
        durationMs: 400,
      },
      elements: [
        {
          id: cryptoId(),
          type: "TEXT",
          frame: { x: 0.1, y: 0.4, w: 0.8, h: 0.15 },
          zIndex: 1,
          visible: true,
          opacity: 1,
          motion: motions?.[i + 1] || {
            type: "ENTER_LEFT",
            startMs: 0,
            durationMs: 350,
          },
          payload: {
            text: `${markerText}-S${i + 2}`,
            color: "#FFFFFF",
            fontSizeNorm: 0.035,
            align: "center",
            weight: "medium",
          },
        },
      ],
    });
  }
  return {
    schemaVersion: 1,
    title,
    compositionAspect: { w: 9, h: 16 },
    scenes,
  };
}

async function captureAndroidCold(device, tag) {
  const dir = path.join(OUT, "screenshots", `${tag}_${device.label}`);
  fs.mkdirSync(dir, { recursive: true });
  const logPath = path.join(OUT, "logs", `${tag}_${device.label}.logcat.txt`);
  adb(device.serial, "logcat", "-c");
  adb(device.serial, "shell", "am", "force-stop", PKG);
  await sleep(400);
  const start = Date.now();
  adb(
    device.serial,
    "shell",
    "am",
    "start",
    "-n",
    `${PKG}/.MainActivity`,
  );
  const times = [200, 500, 1000, 2000, 4000];
  const shots = [];
  for (const t of times) {
    const wait = t - (Date.now() - start);
    if (wait > 0) await sleep(wait);
    const remote = `/sdcard/Download/qa_${tag}_${t}.png`;
    const local = path.join(dir, `t${String(t).padStart(4, "0")}.png`);
    adb(device.serial, "shell", "screencap", "-p", remote);
    const pull = adb(device.serial, "pull", remote, local);
    adb(device.serial, "shell", "rm", remote);
    if (fs.existsSync(local) && fs.statSync(local).size > 100) {
      shots.push(local);
    } else {
      // fallback exec-out
      const r = spawnSync(
        ADB,
        ["-s", device.serial, "exec-out", "screencap", "-p"],
        { maxBuffer: 20 * 1024 * 1024, timeout: 15_000 },
      );
      if (r.status === 0 && r.stdout?.length > 100) {
        fs.writeFileSync(local, r.stdout);
        shots.push(local);
      }
    }
  }
  const log = adb(
    device.serial,
    "logcat",
    "-d",
    "-v",
    "time",
    "*:S",
    "DibayWebView:V",
    "DibaySystemStart:V",
    "DibayIntro:V",
    "Capacitor:V",
    "chromium:W",
  );
  const filtered =
    log.stdout ||
    adb(device.serial, "logcat", "-d", "-t", "400").stdout ||
    "";
  const layerBLines = filtered
    .split("\n")
    .filter((l) =>
      /system_start|SystemStart|LayerB|opening.?pack|verified|intro/i.test(l),
    )
    .slice(0, 200);
  fs.writeFileSync(
    logPath,
    layerBLines.join("\n") || filtered.slice(0, 50_000),
  );
  return { shots, logPath, layerBHit: layerBLines.length };
}

async function captureIosCold(tag) {
  const dir = path.join(OUT, "screenshots", `${tag}_iphonebk`);
  fs.mkdirSync(dir, { recursive: true });
  const idCheck = sh(`idevice_id -l`);
  if (!idCheck.ok || !idCheck.out.includes(IOS_UDID)) {
    return {
      shots: [],
      blocked: true,
      reason: `idevice_id missing ${IOS_UDID}: ${idCheck.out.trim()}`,
    };
  }
  // kill + relaunch via idevicedebug / xcrun if available
  sh(`idevicedebug -u ${IOS_UDID} run ${PKG} >/dev/null 2>&1 &`, {
    timeout: 5000,
  });
  // prefer killall via debugserver is hard; try app restart with ios-deploy-like:
  sh(
    `xcrun simctl 2>/dev/null; idevicedebug run ${PKG} 2>&1 | head -5`,
    { timeout: 8000 },
  );
  // Use libimobiledevice to terminate if possible
  sh(
    `idevicedebug -u ${IOS_UDID} kill ${PKG} 2>/dev/null; sleep 0.3; idevicedebug -u ${IOS_UDID} run ${PKG} >/dev/null 2>&1 &`,
    { timeout: 10000 },
  );
  const start = Date.now();
  const times = [200, 500, 1000, 2000, 4000];
  const shots = [];
  for (const t of times) {
    const wait = t - (Date.now() - start);
    if (wait > 0) await sleep(wait);
    const local = path.join(dir, `t${String(t).padStart(4, "0")}.png`);
    const r = sh(`idevicescreenshot -u ${IOS_UDID} "${local}"`, {
      timeout: 15000,
    });
    if (fs.existsSync(local) && fs.statSync(local).size > 100) {
      shots.push(local);
    } else {
      return {
        shots,
        blocked: shots.length === 0,
        reason: `idevicescreenshot failed: ${r.out?.slice(0, 300)}`,
      };
    }
  }
  return { shots, blocked: false };
}

function analyzeShots(shots) {
  // crude: file size variance + identify via `file` / sips for dominant color NOT_PROVEN without vision
  const notes = [];
  let blankSuspect = 0;
  for (const s of shots) {
    const st = fs.statSync(s);
    if (st.size < 8_000) blankSuspect++;
    notes.push(`${path.basename(s)}:${st.size}b`);
  }
  return { notes, blankSuspect, count: shots.length };
}

async function confirmProduction() {
  const ls = sh(`npx vercel ls --prod 2>&1 | head -12`);
  writeJson("logs/vercel-ls-prod.txt", { out: ls.out });
  // actually write text
  fs.writeFileSync(path.join(OUT, "logs/vercel-ls-prod.txt"), ls.out);
  const newest = (ls.out || "")
    .split("\n")
    .find((l) => l.includes("samarket-") && l.includes("Production"));
  authority.deploymentLine = newest || null;
  authority.deploymentStatus = /Ready/.test(newest || "")
    ? "Ready"
    : /Building/.test(newest || "")
      ? "Building"
      : "UNKNOWN";
  const inspect = sh(
    `npx vercel inspect https://samarket.vercel.app 2>&1 | head -40`,
  );
  fs.writeFileSync(path.join(OUT, "logs/vercel-inspect.txt"), inspect.out);
  const id = (inspect.out || "").match(/id\s+(dpl_\w+)/)?.[1];
  authority.deploymentId = id || null;
  authority.originMain = sh("git rev-parse --short=9 origin/main").out.trim();
  authority.head = sh("git rev-parse --short=9 HEAD").out.trim();
  // alias check
  const aliasReady =
    authority.deploymentStatus === "Ready" ||
    /status\s+● Ready/i.test(inspect.out || "");
  writeJson("AUTHORITY.json", authority);
  return aliasReady;
}

async function main() {
  console.log("=== Intro FINAL Scenario QA ===");
  const ready = await confirmProduction();
  if (!ready && authority.deploymentStatus === "Building") {
    console.log("Waiting for Production Ready…");
    for (let i = 0; i < 24; i++) {
      await sleep(15000);
      if (await confirmProduction()) break;
    }
  }
  if (authority.deploymentStatus !== "Ready" && !ready) {
    console.warn("Production not Ready — continuing with caution");
  }

  const fixtures = ensureFixtures();
  writeJson("fixtures/INDEX.json", fixtures);

  let session;
  try {
    session = await adminSession();
    writeJson("logs/admin-auth.json", {
      ok: true,
      email: session.email,
      userId: session.userId,
    });
  } catch (e) {
    writeJson("logs/admin-auth.json", { ok: false, error: String(e) });
    for (const id of [
      "01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17",
    ]) {
      setScenario(id, "NOT_PROVEN", `admin auth failed: ${e}`, [
        "logs/admin-auth.json",
      ]);
    }
    await writeFinalReport();
    process.exit(2);
  }

  // ---------- 01 System Start ----------
  try {
    const get0 = await api(session, "GET", "/api/admin/intro/system-start");
    const put = await api(session, "PUT", "/api/admin/intro/system-start", {
      backgroundColor: SS_COLOR,
      minVisibleMs: 1800,
      brandAssetEnabled: get0.json?.nextBuild?.brandAssetEnabled ?? false,
      brandSizePreset: get0.json?.nextBuild?.brandSizePreset ?? "M",
      brandXNorm: get0.json?.nextBuild?.brandXNorm ?? 0.5,
      brandYNorm: get0.json?.nextBuild?.brandYNorm ?? 0.5,
      clearBackgroundImage: true,
    });
    const apply = await api(
      session,
      "POST",
      "/api/admin/intro/system-start/apply",
    );
    const get1 = await api(session, "GET", "/api/admin/intro/system-start");
    const colorOk =
      put.status === 200 &&
      put.json?.ok &&
      (put.json?.nextBuild?.backgroundColor === SS_COLOR ||
        get1.json?.nextBuild?.backgroundColor === SS_COLOR);
    const applyOk = apply.status === 200 && apply.json?.ok;
    const evidence = [
      get0.evidencePath,
      put.evidencePath,
      apply.evidencePath,
      get1.evidencePath,
    ];
    const coldEvidence = [];
    const coldNotes = [];
    // Give Live sync a moment
    await sleep(1500);
    for (const d of DEVICES) {
      if (d.platform === "android") {
        const r = await captureAndroidCold(d, "01_ss");
        coldEvidence.push(...r.shots, r.logPath);
        coldNotes.push(
          `${d.label}: shots=${r.shots.length} layerBLines=${r.layerBHit}`,
        );
      } else {
        const r = await captureIosCold("01_ss");
        if (r.blocked) {
          coldNotes.push(`iphonebk: NOT_PROVEN ${r.reason}`);
        } else {
          coldEvidence.push(...r.shots);
          coldNotes.push(`iphonebk: shots=${r.shots.length}`);
        }
      }
    }
    const androidShots = coldEvidence.filter(
      (p) => typeof p === "string" && p.endsWith(".png") && /samsung|xiaomi/.test(p),
    );
    if (!colorOk || !applyOk) {
      setScenario(
        "01",
        "FAIL",
        [
          `colorOk=${colorOk} applyOk=${applyOk} put=${put.status} apply=${apply.status}`,
          put.json?.error,
          apply.json?.error,
          ...coldNotes,
        ],
        [...evidence, ...coldEvidence],
      );
    } else {
      // Device shots = evidence for Owner; never auto product PASS (C7).
      setScenario(
        "01",
        "NOT_PROVEN",
        [
          `API_OK color=${SS_COLOR} applyOk=${applyOk}`,
          `androidShots=${androidShots.length}`,
          "Owner visual confirm on Samsung/Xiaomi/iPhone required for PASS",
          ...coldNotes,
        ],
        [...evidence, ...coldEvidence],
      );
    }
  } catch (e) {
    setScenario("01", "FAIL", String(e));
  }

  // ---------- 02 Create QA fixture doc (C4 — never mint OWNER from QA runner) ----------
  let docRow = null;
  let mediaItem = null;
  let replaceItem = null;
  let logoItem = null;
  let videoItem = null;
  let gifItem = null;
  try {
    const created = await api(session, "POST", "/api/admin/intro/documents", {
      title: `QA ${MARKER}`,
      contentClass: "QA",
    });
    docRow = created.json?.document;
    const get = docRow
      ? await api(
          session,
          "GET",
          `/api/admin/intro/documents/${docRow.document_id}`,
        )
      : null;
    const cls =
      docRow?.content_class || created.json?.document?.content_class || "";
    const ok =
      created.status === 200 &&
      created.json?.ok &&
      docRow?.document_id &&
      cls === "QA" &&
      get?.json?.ok &&
      get.json.document?.document_id === docRow.document_id;
    setScenario(
      "02",
      apiStatus(ok),
      [
        `create status=${created.status}`,
        `id=${docRow?.document_id}`,
        `class=${cls}`,
        `reloadOk=${!!get?.json?.ok}`,
        "QA runner must create content_class=QA",
      ],
      [created.evidencePath, get?.evidencePath].filter(Boolean),
    );
  } catch (e) {
    setScenario("02", "FAIL", String(e));
  }

  // Upload media early for 03+
  try {
    const up = await uploadMedia(session, fixtures.png);
    mediaItem = up.json?.item;
    writeJson("api/media-upload-png.json", { status: up.status, json: up.json });
    const up2 = await uploadMedia(session, fixtures.png2);
    replaceItem = up2.json?.item;
    const upL = await uploadMedia(session, fixtures.png, true);
    logoItem = upL.json?.item;
  } catch (e) {
    writeJson("api/media-upload-error.json", { error: String(e) });
  }

  // ---------- 03 Image insert center/contain ----------
  try {
    if (!docRow || !mediaItem) {
      setScenario("03", "NOT_PROVEN", "missing doc or media");
    } else {
      const frame = defaultImageFrame(
        mediaItem.width || 640,
        mediaItem.height || 360,
      );
      const centered =
        Math.abs(frame.x + frame.w / 2 - 0.5) < 0.02 &&
        Math.abs(frame.y + frame.h / 2 - 0.5) < 0.02;
      const doc = buildDoc({
        title: docRow.title,
        markerText: MARKER,
        mediaId: mediaItem.mediaId || mediaItem.media_id,
        mediaW: mediaItem.width,
        mediaH: mediaItem.height,
      });
      const imgEl = doc.scenes[0].elements.find((e) => e.type === "IMAGE");
      const fitOk = imgEl?.payload?.fit === "CONTAIN";
      const save = await api(
        session,
        "PUT",
        `/api/admin/intro/documents/${docRow.document_id}`,
        {
          expectedDraftVersion: docRow.draft_version,
          document: doc,
          title: doc.title,
        },
      );
      if (save.json?.document) docRow = save.json.document;
      const ok = save.status === 200 && save.json?.ok && centered && fitOk;
      setScenario(
        "03",
        apiStatus(ok),
        [
          `centered=${centered}`,
          `fit=${imgEl?.payload?.fit}`,
          `frame=${JSON.stringify(frame)}`,
          `save=${save.status}`,
          save.json?.error,
        ],
        [save.evidencePath],
      );
    }
  } catch (e) {
    setScenario("03", "FAIL", String(e));
  }

  // ---------- 04 Replace image ----------
  try {
    if (!docRow || !replaceItem || !mediaItem) {
      setScenario("04", "NOT_PROVEN", "missing doc/media");
    } else {
      const oldId = mediaItem.mediaId || mediaItem.media_id;
      const newId = replaceItem.mediaId || replaceItem.media_id;
      const doc = structuredClone(docRow.document);
      const img = doc.scenes[0].elements.find((e) => e.type === "IMAGE");
      if (img) img.payload = { ...img.payload, mediaId: newId };
      const save = await api(
        session,
        "PUT",
        `/api/admin/intro/documents/${docRow.document_id}`,
        {
          expectedDraftVersion: docRow.draft_version,
          document: doc,
        },
      );
      if (save.json?.document) docRow = save.json.document;
      const reloaded = await api(
        session,
        "GET",
        `/api/admin/intro/documents/${docRow.document_id}`,
      );
      const got = reloaded.json?.document?.document?.scenes?.[0]?.elements?.find(
        (e) => e.type === "IMAGE",
      )?.payload?.mediaId;
      const ok =
        save.json?.ok && got === newId && newId !== oldId;
      setScenario(
        "04",
        apiStatus(ok),
        [`old=${oldId}`, `new=${newId}`, `got=${got}`, save.json?.error],
        [save.evidencePath, reloaded.evidencePath],
      );
    }
  } catch (e) {
    setScenario("04", "FAIL", String(e));
  }

  // ---------- 05 Scene CRUD ----------
  try {
    if (!docRow) {
      setScenario("05", "NOT_PROVEN", "missing doc");
    } else {
      const mediaId =
        replaceItem?.mediaId ||
        replaceItem?.media_id ||
        mediaItem?.mediaId ||
        mediaItem?.media_id;
      const doc = buildDoc({
        title: docRow.title,
        markerText: MARKER,
        mediaId,
        scenesExtra: 2,
        transitions: [
          { type: "CUT", durationMs: 0 },
          { type: "FADE", durationMs: 400 },
          { type: "SLIDE_LEFT", durationMs: 350 },
        ],
      });
      const save = await api(
        session,
        "PUT",
        `/api/admin/intro/documents/${docRow.document_id}`,
        {
          expectedDraftVersion: docRow.draft_version,
          document: doc,
        },
      );
      if (save.json?.document) docRow = save.json.document;
      // delete one scene (keep 2)
      const trimmed = structuredClone(docRow.document);
      trimmed.scenes = trimmed.scenes.slice(0, 2);
      const save2 = await api(
        session,
        "PUT",
        `/api/admin/intro/documents/${docRow.document_id}`,
        {
          expectedDraftVersion: docRow.draft_version,
          document: trimmed,
        },
      );
      if (save2.json?.document) docRow = save2.json.document;
      const n = docRow.document?.scenes?.length;
      const ok = save.json?.ok && save2.json?.ok && n === 2;
      setScenario(
        "05",
        apiStatus(ok),
        [
          `add3=${save.json?.document?.document?.scenes?.length ?? save.json?.document?.scenes?.length}`,
          `afterDelete=${n}`,
          save.json?.error,
          save2.json?.error,
        ],
        [save.evidencePath, save2.evidencePath],
      );
    }
  } catch (e) {
    setScenario("05", "FAIL", String(e));
  }

  // ---------- 06 Text / logo / CTA ----------
  try {
    if (!docRow) {
      setScenario("06", "NOT_PROVEN", "missing doc");
    } else {
      const mediaId =
        replaceItem?.mediaId ||
        replaceItem?.media_id ||
        mediaItem?.mediaId ||
        mediaItem?.media_id;
      const logoId = logoItem?.mediaId || logoItem?.media_id || mediaId;
      const doc = buildDoc({
        title: docRow.title,
        markerText: `${MARKER} TEXT`,
        mediaId,
        includeLogo: true,
        logoMediaId: logoId,
        includeCta: true,
        scenesExtra: 1,
      });
      const save = await api(
        session,
        "PUT",
        `/api/admin/intro/documents/${docRow.document_id}`,
        {
          expectedDraftVersion: docRow.draft_version,
          document: doc,
        },
      );
      if (save.json?.document) docRow = save.json.document;
      const els = docRow.document?.scenes?.[0]?.elements || [];
      const types = new Set(els.map((e) => e.type));
      const ok =
        save.json?.ok &&
        types.has("TEXT") &&
        types.has("LOGO") &&
        types.has("CTA");
      setScenario(
        "06",
        apiStatus(ok),
        [`types=${[...types].join(",")}`, save.json?.error],
        [save.evidencePath],
      );
    }
  } catch (e) {
    setScenario("06", "FAIL", String(e));
  }

  // ---------- 07 Media rename / delete in-use block ----------
  try {
    const mid =
      replaceItem?.mediaId ||
      replaceItem?.media_id ||
      mediaItem?.mediaId ||
      mediaItem?.media_id;
    if (!mid) {
      setScenario("07", "NOT_PROVEN", "no media");
    } else {
      const rename = await api(session, "PATCH", "/api/admin/intro/media", {
        mediaId: mid,
        displayName: `QA Marker ${MARKER}`,
      });
      const del = await api(
        session,
        "DELETE",
        `/api/admin/intro/media?mediaId=${encodeURIComponent(mid)}`,
      );
      const msg = String(del.json?.error || "");
      const blocked =
        del.status >= 400 &&
        /사용 중|장면에서 제거/i.test(msg) &&
        !/media_not_found/.test(msg);
      const ok = rename.json?.ok && blocked;
      setScenario(
        "07",
        apiStatus(ok),
        [
          `rename=${rename.status}/${rename.json?.ok}`,
          `delete=${del.status}`,
          `msg=${msg.slice(0, 200)}`,
        ],
        [rename.evidencePath, del.evidencePath],
      );
    }
  } catch (e) {
    setScenario("07", "FAIL", String(e));
  }

  // ---------- 08 GIF ----------
  try {
    if (!fixtures.gif) {
      setScenario("08", "NOT_PROVEN", "gif fixture missing");
    } else {
      const up = await uploadMedia(session, fixtures.gif);
      gifItem = up.json?.item;
      const ok = up.status === 200 && up.json?.ok && gifItem;
      if (ok && docRow) {
        const doc = structuredClone(docRow.document);
        doc.scenes[0].elements.push({
          id: cryptoId(),
          type: "IMAGE",
          frame: defaultImageFrame(gifItem.width || 100, gifItem.height || 100),
          zIndex: 5,
          visible: true,
          opacity: 1,
          motion: { type: "NONE", startMs: 0, durationMs: 0 },
          payload: {
            mediaId: gifItem.mediaId || gifItem.media_id,
            fit: "CONTAIN",
          },
        });
        const save = await api(
          session,
          "PUT",
          `/api/admin/intro/documents/${docRow.document_id}`,
          {
            expectedDraftVersion: docRow.draft_version,
            document: doc,
          },
        );
        if (save.json?.document) docRow = save.json.document;
        const saveOk = save.status === 200 && !!save.json?.ok;
        setScenario(
          "08",
          apiStatus(ok && saveOk),
          [
            `upload=${up.status}`,
            `media=${gifItem.mediaId || gifItem.media_id}`,
            `save=${save.status}`,
            save.json?.error,
          ],
          [up.evidencePath, save.evidencePath],
        );
      } else {
        setScenario(
          "08",
          apiStatus(ok),
          [`upload=${up.status}`, up.json?.error],
          [up.evidencePath],
        );
      }
    }
  } catch (e) {
    setScenario("08", "FAIL", String(e));
  }

  // ---------- 09 MP4 ----------
  try {
    if (!fs.existsSync(fixtures.mp4)) {
      setScenario("09", "NOT_PROVEN", "mp4 fixture missing; ffmpeg failed");
    } else {
      const up = await uploadMedia(session, fixtures.mp4);
      videoItem = up.json?.item;
      const okUpload = up.status === 200 && up.json?.ok && videoItem;
      if (okUpload && docRow) {
        const doc = structuredClone(docRow.document);
        // ensure VIDEO element
        const hasVideo = doc.scenes[0].elements.some((e) => e.type === "VIDEO");
        if (!hasVideo) {
          doc.scenes[0].elements.push({
            id: cryptoId(),
            type: "VIDEO",
            frame: defaultImageFrame(320, 180),
            zIndex: 1,
            visible: true,
            opacity: 1,
            motion: { type: "NONE", startMs: 0, durationMs: 0 },
            payload: {
              mediaId: videoItem.mediaId || videoItem.media_id,
              fit: "CONTAIN",
              loop: true,
              muted: true,
            },
          });
        }
        // bump marker
        const text = doc.scenes[0].elements.find((e) => e.type === "TEXT");
        if (text) text.payload = { ...text.payload, text: `${MARKER} VIDEO` };
        const save = await api(
          session,
          "PUT",
          `/api/admin/intro/documents/${docRow.document_id}`,
          {
            expectedDraftVersion: docRow.draft_version,
            document: doc,
          },
        );
        if (save.json?.document) docRow = save.json.document;
        const saveOk = save.status === 200 && !!save.json?.ok;
        setScenario(
          "09",
          apiStatus(okUpload && saveOk),
          [
            `upload=${up.status}`,
            `video=${videoItem.mediaId || videoItem.media_id}`,
            `save=${save.status}`,
            save.json?.error,
          ],
          [up.evidencePath, save.evidencePath],
        );
      } else {
        setScenario(
          "09",
          apiStatus(okUpload),
          [`upload=${up.status}`, up.json?.error],
          [up.evidencePath],
        );
      }
    }
  } catch (e) {
    setScenario("09", "FAIL", String(e));
  }

  // ---------- 10–11 Transition / Motion tokens ----------
  const TRANSITIONS = [
    "CUT",
    "FADE",
    "SLIDE_LEFT",
    "SLIDE_RIGHT",
    "SLIDE_UP",
    "SLIDE_DOWN",
  ];
  const MOTIONS = [
    "NONE",
    "FADE_IN",
    "ENTER_LEFT",
    "ENTER_RIGHT",
    "ENTER_UP",
    "ENTER_DOWN",
    "SCALE_IN",
  ];
  try {
    if (!docRow) {
      setScenario("10", "NOT_PROVEN", "missing doc");
      setScenario("11", "NOT_PROVEN", "missing doc");
    } else {
      const mediaId =
        replaceItem?.mediaId ||
        replaceItem?.media_id ||
        mediaItem?.mediaId ||
        mediaItem?.media_id;
      const failedT = [];
      for (const t of TRANSITIONS) {
        const doc = buildDoc({
          title: `${docRow.title}`,
          markerText: `${MARKER} T-${t}`,
          mediaId,
          scenesExtra: 1,
          transitions: [
            { type: "CUT", durationMs: 0 },
            {
              type: t,
              durationMs: t === "CUT" ? 0 : 400,
            },
          ],
        });
        const save = await api(
          session,
          "PUT",
          `/api/admin/intro/documents/${docRow.document_id}`,
          {
            expectedDraftVersion: docRow.draft_version,
            document: doc,
          },
        );
        if (save.json?.document) docRow = save.json.document;
        if (!save.json?.ok) failedT.push(`${t}:${save.json?.error || save.status}`);
      }
      setScenario(
        "10",
        apiStatus(failedT.length === 0),
        failedT.length
          ? failedT
          : [`all ${TRANSITIONS.length} transition tokens saved`],
        [],
      );

      const failedM = [];
      for (const m of MOTIONS) {
        const doc = buildDoc({
          title: `${docRow.title}`,
          markerText: `${MARKER} M-${m}`,
          mediaId,
          motions: [
            {
              type: m,
              startMs: 0,
              durationMs: m === "NONE" ? 0 : 400,
            },
          ],
        });
        const save = await api(
          session,
          "PUT",
          `/api/admin/intro/documents/${docRow.document_id}`,
          {
            expectedDraftVersion: docRow.draft_version,
            document: doc,
          },
        );
        if (save.json?.document) docRow = save.json.document;
        if (!save.json?.ok) failedM.push(`${m}:${save.json?.error || save.status}`);
      }
      // Preview package: apply-service builds package — exercised in 13
      setScenario(
        "11",
        apiStatus(failedM.length === 0),
        failedM.length
          ? failedM
          : [
              `all ${MOTIONS.length} motion tokens saved`,
              "Preview package via apply-service in scenario 13",
            ],
        [],
      );
    }
  } catch (e) {
    setScenario("10", "FAIL", String(e));
    setScenario("11", "FAIL", String(e));
  }

  // ---------- 12 Save→reload equality ----------
  try {
    if (!docRow) {
      setScenario("12", "NOT_PROVEN", "missing doc");
    } else {
      const before = structuredClone(docRow.document);
      // ensure final marker text
      const text = before.scenes[0].elements.find((e) => e.type === "TEXT");
      if (text) text.payload = { ...text.payload, text: `${MARKER} FINAL` };
      const save = await api(
        session,
        "PUT",
        `/api/admin/intro/documents/${docRow.document_id}`,
        {
          expectedDraftVersion: docRow.draft_version,
          document: before,
          title: before.title,
        },
      );
      if (save.json?.document) docRow = save.json.document;
      const get = await api(
        session,
        "GET",
        `/api/admin/intro/documents/${docRow.document_id}`,
      );
      const after = get.json?.document?.document;
      const eq =
        JSON.stringify(normalizeForEq(docRow.document)) ===
        JSON.stringify(normalizeForEq(after));
      setScenario(
        "12",
        apiStatus(!!(save.json?.ok && eq)),
        [
          `saveOk=${!!save.json?.ok}`,
          `equality=${eq}`,
          `draft=${docRow.draft_version}`,
        ],
        [save.evidencePath, get.evidencePath],
      );
    }
  } catch (e) {
    setScenario("12", "FAIL", String(e));
  }

  // ---------- 13 Apply gate: QA fixture must NOT become Live (C4) ----------
  try {
    if (!docRow) {
      setScenario("13", "NOT_PROVEN", "missing doc");
    } else {
      const apply = await api(
        session,
        "POST",
        `/api/admin/intro/documents/${docRow.document_id}/apply-service`,
        { idempotencyKey: `qa-final-${MARKER}` },
      );
      const err = String(apply.json?.error || "");
      const rejected =
        apply.status >= 400 &&
        /apply_forbidden_content_class/i.test(err);
      const laundered = apply.status === 200 && apply.json?.ok === true;
      setScenario(
        "13",
        laundered ? "FAIL" : apiStatus(rejected),
        [
          `status=${apply.status}`,
          `error=${err.slice(0, 180)}`,
          laundered
            ? "FAIL: QA Apply succeeded — Live launder"
            : "Expect Apply reject for content_class=QA",
          `marker=${MARKER}`,
        ],
        [apply.evidencePath],
      );
    }
  } catch (e) {
    setScenario("13", "FAIL", String(e));
  }

  // ---------- 14 Device cold without clear — observe new intro ----------
  try {
    const evidence = [];
    const notes = [];
    let androidOk = 0;
    for (const d of DEVICES) {
      if (d.platform === "android") {
        const r = await captureAndroidCold(d, "14_intro");
        evidence.push(...r.shots, r.logPath);
        const analysis = analyzeShots(r.shots);
        notes.push(
          `${d.label}: shots=${r.shots.length} blankSuspect=${analysis.blankSuspect} layerB=${r.layerBHit}`,
        );
        if (r.shots.length >= 4) androidOk++;
      } else {
        const r = await captureIosCold("14_intro");
        if (r.blocked) {
          notes.push(`iphonebk: NOT_PROVEN ${r.reason}`);
        } else {
          evidence.push(...r.shots);
          notes.push(`iphonebk: shots=${r.shots.length}`);
        }
      }
    }
    // Without OCR we cannot prove marker text — use logcat hints + shot presence
    const logHits = evidence
      .filter((p) => p.endsWith(".logcat.txt"))
      .map((p) => fs.readFileSync(p, "utf8"))
      .join("\n");
    const packHint = /opening|intro|package|verified|system_start/i.test(logHits);
    if (androidOk >= 1) {
      setScenario(
        "14",
        "NOT_PROVEN",
        [
          "Cold screenshots captured — Owner visual confirm required for PASS (C7)",
          "QA Apply intentionally blocked — observing current Live only",
          `logHints=${packHint}`,
          ...notes,
        ],
        evidence,
      );
    } else {
      setScenario("14", "FAIL", ["No Android cold screenshots", ...notes], evidence);
    }
  } catch (e) {
    setScenario("14", "FAIL", String(e));
  }

  // ---------- 15 Full startup continuity ----------
  try {
    const evidence = [];
    const notes = [];
    let defects = [];
    for (const d of DEVICES) {
      if (d.platform === "android") {
        const r = await captureAndroidCold(d, "15_continuity");
        evidence.push(...r.shots, r.logPath);
        const a = analyzeShots(r.shots);
        notes.push(`${d.label}: ${a.notes.join(", ")}`);
        if (a.blankSuspect >= 3) {
          defects.push(`${d.label}: many tiny frames (possible blank)`);
        }
        // size oscillation as crude duplicate/flash hint
        const sizes = r.shots.map((s) => fs.statSync(s).size);
        writeJson(`logs/15_${d.label}_sizes.json`, { sizes, shots: r.shots });
      } else {
        const r = await captureIosCold("15_continuity");
        if (r.blocked) {
          notes.push(`iphonebk: NOT_PROVEN ${r.reason}`);
        } else {
          evidence.push(...r.shots);
          notes.push(`iphonebk: shots=${r.shots.length}`);
        }
      }
    }
    const androidDirs = ["15_continuity_samsung", "15_continuity_xiaomi"];
    const have = androidDirs.every((d) =>
      fs.existsSync(path.join(OUT, "screenshots", d)),
    );
    if (have && defects.length === 0) {
      setScenario(
        "15",
        "NOT_PROVEN",
        [
          "Continuity screenshot series captured — Owner visual confirm required for PASS (C7)",
          "Automated pixel classification limited — sizes logged",
          ...notes,
        ],
        evidence,
      );
    } else if (have) {
      setScenario("15", "FAIL", [...defects, ...notes], evidence);
    } else {
      setScenario("15", "NOT_PROVEN", notes, evidence);
    }
  } catch (e) {
    setScenario("15", "FAIL", String(e));
  }

  // ---------- 16 Offline airplane + cold (one Android) ----------
  try {
    const d = DEVICES[0]; // samsung
    // verify local pack exists if possible
    const localCheck = adb(
      d.serial,
      "shell",
      "run-as",
      PKG,
      "ls",
      "files",
    );
    const filesList =
      localCheck.stdout ||
      adb(
        d.serial,
        "shell",
        `ls /data/user/0/${PKG}/files 2>/dev/null || ls /sdcard/Android/data/${PKG}/files 2>/dev/null || echo NO_ACCESS`,
      ).stdout;
    fs.writeFileSync(
      path.join(OUT, "logs/16_local_files.txt"),
      filesList || "empty",
    );
    // airplane on
    adb(d.serial, "shell", "settings", "put", "global", "airplane_mode_on", "1");
    adb(
      d.serial,
      "shell",
      "am",
      "broadcast",
      "-a",
      "android.intent.action.AIRPLANE_MODE",
      "--ez",
      "state",
      "true",
    );
    await sleep(1000);
    const r = await captureAndroidCold(d, "16_offline");
    // airplane off
    adb(d.serial, "shell", "settings", "put", "global", "airplane_mode_on", "0");
    adb(
      d.serial,
      "shell",
      "am",
      "broadcast",
      "-a",
      "android.intent.action.AIRPLANE_MODE",
      "--ez",
      "state",
      "false",
    );
    const ok = r.shots.length >= 4;
    setScenario(
      "16",
      apiStatus(ok),
      [
        `samsung airplane cold shots=${r.shots.length}`,
        `localFilesHint=${(filesList || "").slice(0, 200).replace(/\n/g, " ")}`,
        "Verified-local presence via run-as may be blocked on release builds — screenshots are primary evidence",
      ],
      [...r.shots, r.logPath, path.join(OUT, "logs/16_local_files.txt")],
    );
  } catch (e) {
    // ensure airplane off
    try {
      adb(
        "RFCY40PY2CA",
        "shell",
        "settings",
        "put",
        "global",
        "airplane_mode_on",
        "0",
      );
    } catch {}
    setScenario("16", "FAIL", String(e));
  }

  // ---------- 17 Admin error safety ----------
  try {
    // unit already exists; prove Production API returns Korean not raw invalid_motion
    if (!docRow) {
      setScenario("17", "NOT_PROVEN", "missing doc for invalid attempt");
    } else {
      const bad = structuredClone(docRow.document);
      bad.scenes[0].elements[0].motion = {
        type: "SLIDE_LEFT", // illegal motion token
        startMs: 0,
        durationMs: 300,
      };
      const save = await api(
        session,
        "PUT",
        `/api/admin/intro/documents/${docRow.document_id}`,
        {
          expectedDraftVersion: docRow.draft_version,
          document: bad,
        },
      );
      const err = String(save.json?.error || "");
      const korean =
        /장면|효과를 확인해|등장/.test(err) && !/^invalid_motion/.test(err);
      // also confirm operatorMessageForDocument in source
      const src = fs.readFileSync(
        path.join(ROOT, "lib/intro/contracts/document.ts"),
        "utf8",
      );
      const hasFn = /export function operatorMessageForDocument/.test(src);
      const used = fs
        .readFileSync(path.join(ROOT, "lib/intro/document/service.ts"), "utf8")
        .includes("operatorMessageForDocument");
      setScenario(
        "17",
        apiStatus(hasFn && used && korean && save.status >= 400),
        [
          `operatorMessageForDocument_defined=${hasFn}`,
          `used_in_save=${used}`,
          `status=${save.status}`,
          `error=${err.slice(0, 180)}`,
          `koreanOperatorCopy=${korean}`,
        ],
        [save.evidencePath],
      );
    }
  } catch (e) {
    setScenario("17", "FAIL", String(e));
  }

  await writeFinalReport();
  console.log("DONE", path.join(OUT, "SCENARIO_RESULTS.json"));
}

function normalizeForEq(doc) {
  if (!doc) return null;
  // ignore volatile ordering only — deep compare scenes/elements
  return JSON.parse(JSON.stringify(doc));
}

async function writeFinalReport() {
  const ids = [
    "01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17",
  ];
  const counts = { PASS: 0, FAIL: 0, NOT_PROVEN: 0, API_OK: 0 };
  for (const id of ids) {
    const s = results[id]?.status || "NOT_PROVEN";
    counts[s] = (counts[s] || 0) + 1;
  }
  // C7: this runner never auto-promotes HARD LOCK / product PASS from API_OK.
  const allPass = false;
  const defects = ids
    .filter((id) => results[id]?.status === "FAIL")
    .map((id) => ({
      id,
      notes: results[id].notes,
      evidence: results[id].evidence,
    }));

  const lines = [];
  lines.push("# DIBAY INTRO FINAL — SCENARIO QA FINAL REPORT");
  lines.push("");
  lines.push("## AUTHORITY");
  lines.push("");
  lines.push(`- Production URL: ${authority.productionUrl}`);
  lines.push(`- Deployment: ${authority.deploymentId || "(see logs/vercel-inspect.txt)"}`);
  lines.push(`- Deployment status: ${authority.deploymentStatus}`);
  lines.push(`- origin/main: ${authority.originMain}`);
  lines.push(`- Expected: 435cfd56b + follow-up iOS VIDEO fix (6493b0d18 if pushed)`);
  lines.push(`- HEAD: ${authority.head}`);
  lines.push(`- Marker: ${MARKER}`);
  lines.push(`- System Start color: ${SS_COLOR}`);
  lines.push(`- Devices: Samsung RFCY40PY2CA, Xiaomi 8b37179f7d94, iPhonebk ${IOS_UDID}`);
  lines.push(`- Evidence root: \`.tmp/intro-final-reconstruction/qa/\``);
  lines.push(`- Polled at: ${authority.polledAt}`);
  lines.push("");
  lines.push("## SYSTEM START");
  lines.push("");
  lines.push(`- Scenario 01: **${results["01"]?.status || "NOT_PROVEN"}**`);
  for (const n of results["01"]?.notes || []) lines.push(`  - ${n}`);
  lines.push("");
  lines.push("## INTRO SCENARIOS");
  lines.push("");
  lines.push("| ID | Status | Notes |");
  lines.push("|---|---|---|");
  for (const id of ids) {
    const r = results[id] || { status: "NOT_PROVEN", notes: ["not run"] };
    lines.push(
      `| ${id} | ${r.status} | ${(r.notes || []).join(" / ").replace(/\|/g, "/").slice(0, 220)} |`,
    );
  }
  lines.push("");
  lines.push(
    `Counts: PASS=${counts.PASS} API_OK=${counts.API_OK} FAIL=${counts.FAIL} NOT_PROVEN=${counts.NOT_PROVEN}`,
  );
  lines.push("");
  lines.push("## STARTUP TIMINGS");
  lines.push("");
  lines.push("- Capture schedule: 200 / 500 / 1000 / 2000 / 4000 ms after `am start` / iOS relaunch.");
  lines.push("- Per-device PNG series under `qa/screenshots/`.");
  lines.push("- Automated frame-timing metrics (ms to first Layer B / Intro) NOT instrumented in this runner — screenshot timestamps approximate.");
  lines.push("");
  lines.push("## DEFECTS");
  lines.push("");
  if (defects.length === 0) {
    lines.push("- None recorded as FAIL.");
  } else {
    for (const d of defects) {
      lines.push(`### Scenario ${d.id}`);
      for (const n of d.notes) lines.push(`- ${n}`);
      lines.push("");
    }
  }
  const np = ids.filter((id) => results[id]?.status === "NOT_PROVEN");
  if (np.length) {
    lines.push("### NOT_PROVEN");
    for (const id of np) {
      lines.push(`- ${id}: ${(results[id].notes || []).join("; ")}`);
    }
    lines.push("");
  }
  lines.push("## HARD LOCK");
  lines.push("");
  lines.push(
    `HARD LOCK = **FORBIDDEN** from this runner — PASS=${counts.PASS}/17 API_OK=${counts.API_OK} FAIL=${counts.FAIL} NOT_PROVEN=${counts.NOT_PROVEN}.`,
  );
  lines.push("API_OK ≠ product PASS. Device screenshots ≠ Owner pixel PASS.");
  lines.push("");
  lines.push("## HONESTY NOTE");
  lines.push("");
  lines.push("- CURSOR REPORT ≠ FACT. Status above is from this run's API responses + screenshot/log files only.");
  lines.push("- Marker text on device screens was not OCR'd; Owner should open PNGs under `qa/screenshots/`.");
  lines.push("- iOS may be NOT_PROVEN if USB/usbmux pairing was unavailable at capture time.");
  lines.push("- C7: product PASS / HARD LOCK require Owner-visible G5 acceptance outside this script.");
  lines.push("");

  const reportPath = path.join(ROOT, ".tmp/intro-final-reconstruction/FINAL_REPORT.md");
  fs.writeFileSync(reportPath, lines.join("\n"));
  writeJson("SCENARIO_RESULTS.json", {
    authority,
    counts,
    scenarios: results,
    hardLock: "FORBIDDEN",
    updatedAt: new Date().toISOString(),
  });
  console.log("FINAL_REPORT", reportPath);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(
    path.join(OUT, "FATAL.json"),
    JSON.stringify({ error: String(e), stack: e.stack }, null, 2),
  );
  process.exit(1);
});
