#!/usr/bin/env node
/**
 * DIBAY INTRO — Phase 4 production prove
 * Library list + signed-read + fixture 05 READY visual authority
 * Authz: anon DENY / Admin ALLOW
 * Live remains NEVER_CONFIGURED
 * Does NOT reprocess Phase 3 immutable fixtures.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, ".tmp/intro-phase-4");
const PROD = process.env.INTRO_PHASE4_BASE_URL || "https://samarket.vercel.app";

mkdirSync(OUT, { recursive: true });

function loadEnv() {
  for (const rel of [".env.local", ".env.vercel.production", ".env"]) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function log(msg) {
  console.log(`[phase4] ${msg}`);
}

function passwords() {
  return [
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
}

async function loginAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const login = process.env.E2E_ADMIN_USERNAME || "aaaa";
  const email = login.includes("@") ? login : `${login}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const pass of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (!error && data.session) {
      session = data.session;
      break;
    }
  }
  if (!session) throw new Error("admin login failed");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const cookieName = ref ? `sb-${ref}-auth-token` : "sb-auth-token";
  const cookieSession = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
  let cookie = `${cookieName}=${encodeURIComponent(JSON.stringify(cookieSession))}`;
  if (sk) {
    const adminSb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await adminSb
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    const sid = String(pr?.active_session_id ?? "").trim();
    if (sid) cookie += `; samarket_active_session_id=${encodeURIComponent(sid)}`;
  }
  return { cookie, userId: session.user.id, accessToken: session.access_token };
}

async function api(pathname, cookie, init = {}) {
  const res = await fetch(`${PROD}${pathname}`, {
    ...init,
    headers: {
      accept: "application/json",
      cookie,
      ...(init.body && typeof init.body === "string"
        ? { "content-type": "application/json" }
        : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json, text };
}

async function putFile(signedUrl, bytes, contentType) {
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": contentType, "x-upsert": "true" },
    body: bytes,
  });
  return res.status;
}

async function uploadOne(cookie, name, bytes, mime, mediaKind = "IMAGE") {
  const create = await api("/api/admin/intro/media/create", cookie, {
    method: "POST",
    body: JSON.stringify({ mediaKind, originalName: name }),
  });
  if (create.status !== 200 || !create.json?.mediaId) {
    throw new Error(`create failed ${JSON.stringify(create.json)}`);
  }
  const mediaId = create.json.mediaId;
  const signed = await api(
    `/api/admin/intro/media/${mediaId}/signed-upload`,
    cookie,
    { method: "POST", body: "{}" },
  );
  if (signed.status !== 200 || !signed.json?.signedUrl) {
    throw new Error(`signed-upload failed ${JSON.stringify(signed.json)}`);
  }
  const putStatus = await putFile(signed.json.signedUrl, bytes, mime);
  if (putStatus < 200 || putStatus >= 300) {
    throw new Error(`put failed ${putStatus}`);
  }
  const confirm = await api(
    `/api/admin/intro/media/${mediaId}/confirm-upload`,
    cookie,
    { method: "POST", body: "{}" },
  );
  if (confirm.status !== 200) {
    throw new Error(`confirm failed ${JSON.stringify(confirm.json)}`);
  }
  const process = await api(
    `/api/admin/intro/media/${mediaId}/process`,
    cookie,
    { method: "POST", body: "{}" },
  );
  return { mediaId, process };
}

async function main() {
  loadEnv();
  const report = {
    baseUrl: PROD,
    startedAt: new Date().toISOString(),
    steps: {},
  };

  // --- Authz ---
  const anonList = await api("/api/admin/intro/media", "");
  report.steps.anonList = {
    status: anonList.status,
    deny: anonList.status === 401 || anonList.status === 403,
  };
  log(`anon list → ${anonList.status} (expect 401/403)`);

  const { cookie } = await loginAdmin();
  const adminList = await api("/api/admin/intro/media", cookie);
  report.steps.adminList = {
    status: adminList.status,
    count: adminList.json?.items?.length ?? 0,
    ok: adminList.status === 200 && adminList.json?.ok === true,
  };
  log(
    `admin list → ${adminList.status} items=${report.steps.adminList.count}`,
  );
  if (!report.steps.adminList.ok) throw new Error("admin list failed");

  // Fixture 05 — do NOT reprocess; find READY GIF with CANONICAL_ANIMATED_GIF
  const items = adminList.json.items || [];
  let gif05 = items.find(
    (it) =>
      it.status === "READY" &&
      (it.runtimeFormat === "CANONICAL_ANIMATED_GIF" || it.animated === true) &&
      String(it.originalName || "").includes("05"),
  );
  if (!gif05) {
    gif05 = items.find(
      (it) =>
        it.status === "READY" && it.runtimeFormat === "CANONICAL_ANIMATED_GIF",
    );
  }
  report.steps.fixture05List = gif05
    ? {
        found: true,
        mediaId: gif05.mediaId,
        status: gif05.status,
        runtimeFormat: gif05.runtimeFormat,
        animated: gif05.animated,
        framesHint: null,
      }
    : { found: false };

  if (!gif05) throw new Error("Phase 3 fixture 05 READY not found in Library");

  const get05 = await api(`/api/admin/intro/media/${gif05.mediaId}`, cookie);
  const anim = get05.json?.runtime?.animationMetadata ?? null;
  report.steps.fixture05Get = {
    status: get05.status,
    format: get05.json?.runtime?.format,
    frameCount: anim?.frameCount ?? anim?.frames ?? null,
    delays: anim?.delaysMs ?? anim?.delays ?? anim?.frameDelays ?? null,
  };
  log(
    `fixture05 get format=${report.steps.fixture05Get.format} frames=${JSON.stringify(report.steps.fixture05Get.frameCount)} delays=${JSON.stringify(report.steps.fixture05Get.delays)}`,
  );

  const signedRead = await api(
    `/api/admin/intro/media/${gif05.mediaId}/signed-read`,
    cookie,
    { method: "POST", body: JSON.stringify({ purpose: "runtime" }) },
  );
  report.steps.signedRead = {
    status: signedRead.status,
    ok: signedRead.status === 200 && typeof signedRead.json?.signedUrl === "string",
    animated: signedRead.json?.animated === true,
    format: signedRead.json?.format,
    hasPermanentPublicHint: String(signedRead.json?.signedUrl || "").includes(
      "/object/public/",
    ),
  };
  if (!report.steps.signedRead.ok) {
    throw new Error(`signed-read failed ${JSON.stringify(signedRead.json)}`);
  }
  if (report.steps.signedRead.hasPermanentPublicHint) {
    throw new Error("signed-read returned public object URL");
  }

  // Fetch runtime bytes and prove animation pages > 1
  const bin = Buffer.from(
    await (await fetch(signedRead.json.signedUrl)).arrayBuffer(),
  );
  const meta = await sharp(bin, { animated: true }).metadata();
  const pages = meta.pages ?? 1;
  report.steps.fixture05RuntimeBytes = {
    byteLength: bin.length,
    pages,
    width: meta.width,
    height: meta.height,
    animatedPagesPass: pages >= 3,
  };
  log(`fixture05 runtime pages=${pages} (expect >= 3)`);
  if (pages < 3) throw new Error("fixture 05 runtime is not multi-frame");

  // Upload smoke: tiny JPEG through Library APIs
  const jpeg = await sharp({
    create: { width: 32, height: 24, channels: 3, background: "#336699" },
  })
    .jpeg()
    .toBuffer();
  const up = await uploadOne(
    cookie,
    `phase4-lib-${Date.now()}.jpg`,
    jpeg,
    "image/jpeg",
  );
  report.steps.uploadJpeg = {
    mediaId: up.mediaId,
    processStatus: up.process.status,
    mediaStatus: up.process.json?.status,
    ready: up.process.json?.status === "READY",
  };
  log(
    `upload jpeg → process ${up.process.status} status=${up.process.json?.status}`,
  );
  if (!report.steps.uploadJpeg.ready) {
    throw new Error(`jpeg not READY ${JSON.stringify(up.process.json)}`);
  }

  const readJpeg = await api(
    `/api/admin/intro/media/${up.mediaId}/signed-read`,
    cookie,
    { method: "POST", body: JSON.stringify({ purpose: "runtime" }) },
  );
  report.steps.jpegSignedRead = {
    ok: readJpeg.status === 200 && typeof readJpeg.json?.signedUrl === "string",
    format: readJpeg.json?.format,
  };

  // Malformed failure — not READY
  const bad = await uploadOne(
    cookie,
    `phase4-bad-${Date.now()}.bin`,
    Buffer.from("not-an-image-payload"),
    "application/octet-stream",
  );
  report.steps.malformed = {
    mediaId: bad.mediaId,
    status: bad.process.json?.status,
    category: bad.process.json?.category,
    notReady: bad.process.json?.status !== "READY",
  };
  log(
    `malformed → status=${bad.process.json?.status} cat=${bad.process.json?.category}`,
  );

  // Live inert
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const adminSb = createClient(url, sk, { auth: { persistSession: false } });
  const { data: live } = await adminSb
    .from("app_intro_live_pointer")
    .select("*")
    .limit(5);
  report.steps.live = {
    rows: live?.length ?? 0,
    inert: !live || live.length === 0,
  };
  log(`live rows=${report.steps.live.rows} (expect 0)`);

  // Admin HTML surfaces
  const libHtml = await fetch(`${PROD}/admin/intro/media`, {
    headers: { cookie, accept: "text/html" },
    redirect: "manual",
  });
  report.steps.libraryHtml = {
    status: libHtml.status,
    reachable: libHtml.status === 200 || libHtml.status === 307 || libHtml.status === 302,
  };

  report.ok =
    report.steps.anonList.deny &&
    report.steps.adminList.ok &&
    report.steps.fixture05List.found &&
    report.steps.signedRead.ok &&
    report.steps.fixture05RuntimeBytes.animatedPagesPass &&
    report.steps.uploadJpeg.ready &&
    report.steps.jpegSignedRead.ok &&
    report.steps.malformed.notReady &&
    report.steps.live.inert;

  report.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, "phase4-prove.json"), JSON.stringify(report, null, 2));
  log(`PASS=${report.ok} wrote ${join(OUT, "phase4-prove.json")}`);
  if (!report.ok) process.exit(1);
}

main().catch((err) => {
  console.error("[phase4] FAIL", err);
  process.exit(1);
});
