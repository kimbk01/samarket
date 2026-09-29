#!/usr/bin/env node
/**
 * DIBAY INTRO — Phase 3 production prove
 * 1) Deployed processor probe (fixtures 01–05, mandatory 05)
 * 2) Product Media pipeline E2E: JPEG/PNG/WebP/GIF → READY
 * 3) Live remains NEVER_CONFIGURED
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, ".tmp/intro-phase-3");
const PROD = process.env.INTRO_PHASE3_BASE_URL || "https://samarket.vercel.app";
const GIF_DIR = join(ROOT, "fixtures/intro/gif");

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function log(msg) {
  console.log(`[phase3] ${msg}`);
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
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
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
  return { cookie, userId: session.user.id };
}

async function api(pathname, cookie, init = {}) {
  const res = await fetch(`${PROD}${pathname}`, {
    ...init,
    headers: {
      accept: "application/json",
      cookie,
      ...(init.body && !(init.body instanceof Buffer) && typeof init.body === "string"
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
  return { status: res.status, json };
}

async function putSigned(signedUrl, bytes, contentType) {
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "content-type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 200) };
}

async function makeStaticFixtures() {
  const jpeg = await sharp({
    create: {
      width: 32,
      height: 16,
      channels: 3,
      background: { r: 40, g: 80, b: 160 },
    },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

  const png = await sharp({
    create: {
      width: 24,
      height: 24,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.35 },
    },
  })
    .png()
    .toBuffer();

  const webp = await sharp(png).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  return { jpeg, png, webp };
}

async function runMediaE2E(cookie, label, bytes, contentType, mediaKind) {
  const create = await api("/api/admin/intro/media/create", cookie, {
    method: "POST",
    body: JSON.stringify({
      mediaKind,
      originalName: `phase3-${label}.bin`,
    }),
  });
  if (!create.json?.ok) {
    return { label, pass: false, stage: "create", create };
  }
  const mediaId = create.json.mediaId;

  const signed = await api(`/api/admin/intro/media/${mediaId}/signed-upload`, cookie, {
    method: "POST",
    body: "{}",
  });
  if (!signed.json?.ok) {
    return { label, pass: false, stage: "signed-upload", mediaId, signed };
  }

  const put = await putSigned(signed.json.signedUrl, bytes, contentType);
  if (put.status < 200 || put.status >= 300) {
    return { label, pass: false, stage: "put", mediaId, put };
  }

  const confirm = await api(`/api/admin/intro/media/${mediaId}/confirm-upload`, cookie, {
    method: "POST",
    body: "{}",
  });
  if (!confirm.json?.ok || confirm.json.status !== "UPLOADED") {
    return { label, pass: false, stage: "confirm", mediaId, confirm };
  }

  const process = await api(`/api/admin/intro/media/${mediaId}/process`, cookie, {
    method: "POST",
    body: "{}",
  });
  if (!process.json?.ok || process.json.status !== "READY") {
    return { label, pass: false, stage: "process", mediaId, process };
  }

  const fetch1 = await api(`/api/admin/intro/media/${mediaId}`, cookie);
  const fetch2 = await api(`/api/admin/intro/media/${mediaId}`, cookie);
  const hardRefetch =
    fetch1.json?.ok &&
    fetch2.json?.ok &&
    fetch1.json.mediaId === fetch2.json.mediaId &&
    fetch1.json.runtimeArtifactId === fetch2.json.runtimeArtifactId &&
    fetch1.json.runtime?.integrity === fetch2.json.runtime?.integrity;

  // Idempotent reprocess
  const process2 = await api(`/api/admin/intro/media/${mediaId}/process`, cookie, {
    method: "POST",
    body: "{}",
  });
  const idempotent =
    process2.json?.ok &&
    process2.json.runtimeArtifactId === process.json.runtimeArtifactId &&
    process2.json.integrity === process.json.integrity;

  return {
    label,
    pass:
      hardRefetch &&
      idempotent &&
      process.json.status === "READY" &&
      Boolean(process.json.runtimeArtifactId),
    mediaId,
    runtimeArtifactId: process.json.runtimeArtifactId,
    integrity: process.json.integrity,
    format: process.json.format,
    animationMetadata: process.json.animationMetadata,
    hardRefetch,
    idempotent,
    reusedOnRetry: process2.json?.reused === true,
  };
}

async function authDenyChecks() {
  const anonCreate = await fetch(`${PROD}/api/admin/intro/media/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const anonProcess = await fetch(
    `${PROD}/api/admin/intro/media/00000000-0000-0000-0000-000000000000/process`,
    { method: "POST" },
  );
  return {
    anonCreateStatus: anonCreate.status,
    anonProcessStatus: anonProcess.status,
    pass: anonCreate.status === 401 && anonProcess.status === 401,
  };
}

async function liveInert() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, sk, { auth: { persistSession: false } });
  // Direct SQL not available — use REST on app_intro_live if service role can read
  const { data, error } = await sb
    .from("app_intro_live")
    .select("live_kind, published_revision_id, pack_id")
    .eq("singleton", true)
    .maybeSingle();
  return {
    error: error?.message ?? null,
    live: data,
    pass:
      !error &&
      data?.live_kind === "NEVER_CONFIGURED" &&
      data?.published_revision_id == null &&
      data?.pack_id == null,
  };
}

async function main() {
  loadEnv();
  const report = {
    at: new Date().toISOString(),
    productionBase: PROD,
    probe: null,
    auth: null,
    e2e: [],
    live: null,
    final: "FAIL",
  };

  // Probe — admin cookie preferred (secret optional)
  const { cookie } = await loginAdmin();
  log("admin login ok");

  const probe = await api("/api/admin/intro/processor-probe", cookie, {
    method: "POST",
    body: "{}",
  });
  report.probe = probe;
  writeFileSync(join(OUT, "probe.json"), JSON.stringify(probe, null, 2));
  log(`probe status=${probe.status} host=${probe.json?.host} ok=${probe.json?.ok}`);

  if (!probe.json?.ok || probe.json?.host !== "PASS") {
    report.final = "PROCESSOR_HOST_BLOCKED";
    writeFileSync(join(OUT, "PHASE3_REPORT.json"), JSON.stringify(report, null, 2));
    console.error("PROCESSOR_HOST_BLOCKED", probe.json?.firstDivergence);
    process.exit(2);
  }

  report.auth = await authDenyChecks();
  log(`auth deny pass=${report.auth.pass}`);

  const statics = await makeStaticFixtures();
  const gif05 = readFileSync(join(GIF_DIR, "05_disposal_sensitive.gif"));

  for (const [label, bytes, mime, kind] of [
    ["jpeg", statics.jpeg, "image/jpeg", "IMAGE"],
    ["png", statics.png, "image/png", "LOGO"],
    ["webp", statics.webp, "image/webp", "IMAGE"],
    ["gif05", gif05, "image/gif", "GIF"],
  ]) {
    log(`e2e ${label} start`);
    const result = await runMediaE2E(cookie, label, bytes, mime, kind);
    report.e2e.push(result);
    log(`e2e ${label} pass=${result.pass} stage=${result.stage || "ready"}`);
  }

  report.live = await liveInert();
  log(`live inert pass=${report.live.pass}`);

  const gif = report.e2e.find((e) => e.label === "gif05");
  const gifPlayback =
    gif?.pass &&
    gif.animationMetadata?.frameCount === 3 &&
    JSON.stringify(gif.animationMetadata?.delaysMs) === JSON.stringify([120, 120, 120]);

  report.final =
    report.probe.json?.ok &&
    report.auth.pass &&
    report.e2e.every((e) => e.pass) &&
    gifPlayback &&
    report.live.pass
      ? "PASS"
      : "FAIL";

  writeFileSync(join(OUT, "PHASE3_REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ final: report.final, gifPlayback }, null, 2));
  process.exit(report.final === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
