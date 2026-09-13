/**
 * DIBAY NEW CLEAN-ROOM — Production Admin operability audit (registration first).
 * No Community publish. No old crawler. Stop at first divergence (report only).
 *
 *   node scripts/qa/external-board-production-operability.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const ROUTE = "/admin/community/external-board";
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const ARTIFACT = resolve(process.cwd(), "tests/e2e/.artifacts/external-board-production-operability.json");
const SHOT_DIR = resolve(process.cwd(), "tests/e2e/.artifacts/external-board-operability-shots");

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
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

async function loginSession(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const passwords = [
    ...new Set(
      [process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_ADMIN_PASSWORD, "DibayQa1!", "1234"].filter(
        Boolean
      )
    ),
  ];
  for (const password of passwords) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return { session: data.session, method: "password" };
  }
  if (!sk) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) return null;
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified?.session) return null;
  return { session: verified.session, method: "magiclink" };
}

async function ensureActiveSessionId(userId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk || !userId) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data } = await admin.from("profiles").select("active_session_id").eq("id", userId).maybeSingle();
  let activeSessionId = String(data?.active_session_id ?? "").trim();
  // Session binding only — does NOT grant/revoke admin_memberships.
  if (!activeSessionId) {
    activeSessionId = crypto.randomUUID();
    await admin.from("profiles").update({ active_session_id: activeSessionId }).eq("id", userId);
  }
  return activeSessionId;
}

function authCookies(session, activeSessionId = null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = new URL(url).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type || "bearer",
      user: session.user,
    })
  );
  const base = {
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  // Match Production cookie contract (ACTIVE_SESSION_COOKIE = samarket_active_session_id).
  // Chunk auth token the same way as proven admin settlement QA harnesses.
  const CHUNK = 3180;
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  const cookies =
    parts.length === 1
      ? [{ ...base, name: `sb-${ref}-auth-token`, value: parts[0] }]
      : parts.map((value, i) => ({ ...base, name: `sb-${ref}-auth-token.${i}`, value }));
  cookies.push({ ...base, name: "samarket_signup_locale", value: "ko" });
  if (activeSessionId) cookies.push({ ...base, name: "samarket_active_session_id", value: activeSessionId });
  return cookies;
}

function serviceSb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk) throw new Error("missing_supabase_service");
  return createClient(url, sk, { auth: { persistSession: false } });
}

function pf(ok) {
  return ok ? "PASS" : "FAIL";
}

async function main() {
  loadEnv();
  mkdirSync(SHOT_DIR, { recursive: true });
  const stamp = Date.now();
  const qaName = `DIBAY CLEANROOM QA ${stamp}`;
  const qaUrl = `https://fixture.external-board.local/qa-operability-${stamp}`;
  const qaRights = "TEST_ONLY / QA registration proof — not republish rights";

  const report = {
    title: "DIBAY CLEAN-ROOM PRODUCTION OPERABILITY AUDIT",
    origin: ORIGIN,
    route: ROUTE,
    productionShaRequested: "b94ed9a5fe46262f1a14b3551e17706231195daf",
    productionShaActual: null,
    headLocal: null,
    ADMIN_AUTH: "FAIL",
    NEW_ADMIN_UI: "FAIL",
    VISIBLE_CONTROLS: [],
    REGISTER: "FAIL",
    REGISTER_REQUEST: null,
    SOURCE_ID: null,
    DB_PERSIST: "FAIL",
    HARD_REFRESH: "FAIL",
    REENTRY: "FAIL",
    DUPLICATE_GUARD: "FAIL",
    EDIT_UPDATE: "FAIL",
    VERIFY_CTA: "FAIL",
    VERIFY_RESULT: null,
    VERIFY_OPERATOR_REASON: null,
    VERIFY_REQUEST: null,
    LIST: "FAIL",
    DETAIL: "FAIL",
    RETRY: "FAIL",
    STATUS_VISIBILITY: "FAIL",
    OPERATOR_ERROR_COPY: null,
    QA_CLEANUP: "NOT_AVAILABLE",
    OLD_IMPORT_USED: "NO",
    COMMUNITY_POST_PUBLISHED: "NO",
    FIRST_DIVERGENCE: null,
    ROOT_CAUSE: null,
    PRODUCTION_OPERABILITY: "FAIL",
    REAL_SOURCE_FINAL_E2E: "NOT_RUN",
    steps: [],
  };

  const stop = (divergence, rootCause, extra = {}) => {
    Object.assign(report, extra);
    report.FIRST_DIVERGENCE = divergence;
    report.ROOT_CAUSE = rootCause;
    report.PRODUCTION_OPERABILITY = "FAIL";
    writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  };

  try {
    report.headLocal = readFileSync(resolve(process.cwd(), ".git/refs/heads/main"), "utf8").trim();
  } catch {
    /* ignore */
  }

  const login = await loginSession(EMAIL);
  if (!login?.session) {
    stop("ADMIN AUTH failed — could not create Production Admin session", "login_session_null");
    return;
  }

  const activeSessionId = await ensureActiveSessionId(login.session.user.id);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(authCookies(login.session, activeSessionId));
  const page = await context.newPage();

  const apiLog = [];
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("/api/admin/community/external-board") || u.includes("/api/admin/community/board-import") || u.includes("/api/admin/community/crawl")) {
      apiLog.push({ phase: "request", method: req.method(), url: u });
    }
  });
  page.on("response", async (res) => {
    const u = res.url();
    if (u.includes("/api/admin/community/external-board") || u.includes("/api/admin/community/board-import") || u.includes("/api/admin/community/crawl")) {
      let body = null;
      try {
        body = await res.json();
      } catch {
        try {
          body = (await res.text()).slice(0, 500);
        } catch {
          body = null;
        }
      }
      apiLog.push({ phase: "response", method: res.request().method(), url: u, status: res.status(), body });
    }
  });

  // —— A. Auth + NEW UI ——
  await page.goto(`${ORIGIN}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);
  const urlAfter = page.url();
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const titleText = await page.locator("h1").first().textContent().catch(() => "");
  await page.screenshot({ path: resolve(SHOT_DIR, "01-admin-page.png"), fullPage: true });

  const loginRedirect = urlAfter.includes("/login") || urlAfter.includes("auth_required");
  const adminGatePanel = bodyText.includes("관리자 인증이 필요합니다");
  const authOk = !loginRedirect && !adminGatePanel;
  report.ADMIN_AUTH = pf(authOk);
  report.ADMIN_IDENTITY = EMAIL;
  report.QA_IS_ACTIVE_ADMIN_DB = "see authority probe";
  if (!authOk) {
    await browser.close();
    stop(
      adminGatePanel
        ? "EXPECTED requireAdmin PASS for active admin session; ACTUAL AdminAccessDeniedPanel"
        : "EXPECTED authenticated Admin page; ACTUAL auth redirect",
      adminGatePanel ? "admin_gate_denied_despite_session" : "admin_session_not_accepted_by_production",
      {
        ACTUAL_URL: urlAfter,
        NEW_ADMIN_UI: "NOT_TESTED",
        REGISTER: "NOT_RUN",
        PRODUCTION_OPERABILITY: "NOT_PROVEN — BLOCKED_BY_ADMIN_AUTH",
      }
    );
    return;
  }

  const productNameVisible = (titleText || "").includes("외부 게시판") || (await page.content()).includes("external-board");
  const hasSourceUrl = (await page.locator('label:has-text("Source URL")').count()) > 0;
  const hasBoardName = (await page.locator('label:has-text("Board name")').count()) > 0;
  const hasRights = (await page.locator('label:has-text("Rights basis")').count()) > 0;
  const hasTopic = (await page.locator('label:has-text("DIBAY target topic slug")').count()) > 0;
  const hasMode = (await page.locator('label:has-text("Mode")').count()) > 0;
  const hasRegister = (await page.getByRole("button", { name: "등록" }).count()) > 0;
  const hasVerifyLabel = (await page.getByRole("button", { name: "게시판 확인" }).count()) >= 0;
  const authorsTab = (await page.getByRole("button", { name: "작성자 풀" }).count()) > 0;

  report.VISIBLE_CONTROLS = [
    hasBoardName ? "Board name" : null,
    hasSourceUrl ? "Source URL" : null,
    hasRights ? "Rights basis" : null,
    hasTopic ? "DIBAY target topic slug" : null,
    hasMode ? "Mode MANUAL|AUTO" : null,
    authorsTab ? "author pools surface" : null,
    (await page.locator('label:has-text("Rights policy requires Public attribution")').count()) > 0
      ? "attribution policy checkbox"
      : null,
    (await page.locator('label:has-text("Board sequence verified")').count()) > 0
      ? "board sequence / chronology CASE B"
      : null,
    hasRegister ? "Register CTA (등록)" : null,
    "date/view seed policy inputs: NOT VISIBLE on register form",
  ].filter(Boolean);

  const uiOk =
    productNameVisible && hasSourceUrl && hasBoardName && hasRights && hasMode && hasRegister && hasTopic;
  report.NEW_ADMIN_UI = pf(uiOk);
  report.steps.push({ A: { urlAfter, titleText, VISIBLE_CONTROLS: report.VISIBLE_CONTROLS } });

  if (!uiOk) {
    await browser.close();
    stop(
      "EXPECTED NEW Admin register controls; ACTUAL missing required controls",
      "new_admin_ui_controls_incomplete",
      { VISIBLE_CONTROLS: report.VISIBLE_CONTROLS }
    );
    return;
  }

  // date/view seed not on UI — note but continue if core register works (Owner asked exact fields only)
  // —— B. Register ——
  const beforeCountRes = await page.request.get(`${ORIGIN}/api/admin/community/external-board/boards`);
  const beforeJson = await beforeCountRes.json().catch(() => ({}));
  const beforeCount = Array.isArray(beforeJson.sources) ? beforeJson.sources.length : null;

  await page.locator('label:has-text("Source URL") input').fill(qaUrl);
  await page.locator('label:has-text("Board name") input').fill(qaName);
  await page.locator('label:has-text("Rights basis") textarea').fill(qaRights);
  await page.locator('label:has-text("DIBAY target topic slug") input').fill("travel");
  await page.locator('label:has-text("Mode") select').selectOption("MANUAL");

  const registerWait = page.waitForResponse(
    (r) => r.url().includes("/api/admin/community/external-board/boards") && r.request().method() === "POST",
    { timeout: 60000 }
  );
  await page.getByRole("button", { name: "등록" }).click();
  const registerRes = await registerWait.catch(() => null);
  await page.waitForTimeout(1500);

  let registerBody = null;
  let registerStatus = null;
  if (registerRes) {
    registerStatus = registerRes.status();
    registerBody = await registerRes.json().catch(() => null);
  }
  report.REGISTER_REQUEST = {
    METHOD: "POST",
    PATH: "/api/admin/community/external-board/boards",
    STATUS: registerStatus,
    BODY_OK: registerBody?.ok ?? null,
    ERROR: registerBody?.error ?? null,
  };

  const sourceId = registerBody?.source?.id ? String(registerBody.source.id) : null;
  report.SOURCE_ID = sourceId;
  await page.screenshot({ path: resolve(SHOT_DIR, "02-after-register.png"), fullPage: true });

  if (!registerRes || registerStatus !== 200 || !registerBody?.ok || !sourceId) {
    await browser.close();
    stop(
      "EXPECTED register POST 200 + source.id; ACTUAL failed or missing id",
      "register_request_failed",
      { REGISTER: "FAIL", REGISTER_REQUEST: report.REGISTER_REQUEST, apiLogTail: apiLog.slice(-10) }
    );
    return;
  }
  report.REGISTER = "PASS";

  // DB readback
  const sb = serviceSb();
  const { data: dbRow, error: dbErr } = await sb
    .from("external_board_sources")
    .select("id, source_board_name, source_url, rights_basis, rights_status, mode, target_topic_slug, site_key, board_key")
    .eq("id", sourceId)
    .maybeSingle();
  report.DB_PERSIST = pf(Boolean(dbRow?.id) && !dbErr);
  report.steps.push({ B: { sourceId, dbRow, dbErr: dbErr?.message ?? null } });
  if (!dbRow?.id) {
    await browser.close();
    stop("EXPECTED DB row after register; ACTUAL MISSING", "db_row_missing_after_register", {
      DB_PERSIST: "FAIL",
    });
    return;
  }

  // —— C. Persistence / reload ——
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const afterRefreshText = await page.content();
  const presentAfterRefresh = afterRefreshText.includes(qaName) || afterRefreshText.includes(sourceId);
  report.HARD_REFRESH = pf(presentAfterRefresh);
  await page.screenshot({ path: resolve(SHOT_DIR, "03-hard-refresh.png"), fullPage: true });
  if (!presentAfterRefresh) {
    await browser.close();
    stop("EXPECTED source visible after hard refresh; ACTUAL MISSING", "hard_refresh_missing");
    return;
  }

  await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.goto(`${ORIGIN}${ROUTE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const reentryText = await page.content();
  const presentReentry = reentryText.includes(qaName) || reentryText.includes(sourceId);
  report.REENTRY = pf(presentReentry);
  if (!presentReentry) {
    await browser.close();
    stop("EXPECTED source after leave/reentry; ACTUAL MISSING", "reentry_missing");
    return;
  }

  const listApi = await page.request.get(`${ORIGIN}/api/admin/community/external-board/boards`);
  const listJson = await listApi.json();
  const listed = (listJson.sources || []).find((s) => s.id === sourceId);
  const apiReadbackOk = Boolean(listed);
  report.steps.push({
    C: {
      HARD_REFRESH: report.HARD_REFRESH,
      REENTRY: report.REENTRY,
      API_READBACK: pf(apiReadbackOk),
      listed,
      FIELD_LOSS: [],
    },
  });

  const fieldLoss = [];
  if (listed) {
    if (String(listed.source_board_name) !== qaName) fieldLoss.push("source_board_name");
    if (!String(listed.source_url || "").includes(`qa-operability-${stamp}`)) fieldLoss.push("source_url");
    if (String(listed.rights_status) !== "declared") fieldLoss.push("rights_status");
    if (!String(listed.rights_basis || "").includes("TEST_ONLY")) fieldLoss.push("rights_basis");
    if (String(listed.mode) !== "MANUAL") fieldLoss.push("mode");
    if (String(listed.target_topic_slug || "") !== "travel") fieldLoss.push("target_topic_slug");
  } else {
    fieldLoss.push("source_missing_from_api");
  }
  report.steps[report.steps.length - 1].C.FIELD_LOSS = fieldLoss.length ? fieldLoss : "NONE";
  if (!apiReadbackOk || fieldLoss.length) {
    await browser.close();
    stop("EXPECTED API/DB field readback intact; ACTUAL field loss", "field_loss_after_reload", {
      FIELD_LOSS: fieldLoss,
    });
    return;
  }

  // —— D. Duplicate ——
  const countBeforeDup = (listJson.sources || []).filter((s) =>
    String(s.source_url || "").includes(`qa-operability-${stamp}`)
  ).length;
  const beforeDupRow = (listJson.sources || []).find((s) => s.id === sourceId);
  const nameBefore = String(beforeDupRow?.source_board_name || "");
  const rightsBefore = String(beforeDupRow?.rights_basis || "");
  const modeBefore = String(beforeDupRow?.mode || "");
  const topicBefore = String(beforeDupRow?.target_topic_slug || "");

  await page.locator('label:has-text("Source URL") input').fill(qaUrl);
  await page.locator('label:has-text("Board name") input').fill(`${qaName} DUP`);
  await page.locator('label:has-text("Rights basis") textarea').fill(`${qaRights} MUTATED`);
  await page.locator('label:has-text("DIBAY target topic slug") input').fill("mutated-topic");
  await page.locator('label:has-text("Mode") select').selectOption("AUTO");
  const dupWait = page.waitForResponse(
    (r) => r.url().includes("/api/admin/community/external-board/boards") && r.request().method() === "POST",
    { timeout: 60000 }
  );
  await page.getByRole("button", { name: "등록" }).click();
  const dupRes = await dupWait.catch(() => null);
  await page.waitForTimeout(1500);
  let dupStatus = null;
  let dupBody = null;
  if (dupRes) {
    dupStatus = dupRes.status();
    dupBody = await dupRes.json().catch(() => null);
  }
  const pageError = await page.locator(".text-red-800, .text-red-700").first().textContent().catch(() => null);
  const listAfterDup = await (await page.request.get(`${ORIGIN}/api/admin/community/external-board/boards`)).json();
  const countAfterDup = (listAfterDup.sources || []).filter((s) =>
    String(s.source_url || "").includes(`qa-operability-${stamp}`)
  ).length;
  const afterDupRow = (listAfterDup.sources || []).find((s) => s.id === sourceId);
  const nameAfter = String(afterDupRow?.source_board_name || "");
  const rightsAfter = String(afterDupRow?.rights_basis || "");
  const modeAfter = String(afterDupRow?.mode || "");
  const topicAfter = String(afterDupRow?.target_topic_slug || "");
  const dupDelta = countAfterDup - countBeforeDup;
  const mutationZero =
    nameAfter === nameBefore &&
    rightsAfter === rightsBefore &&
    modeAfter === modeBefore &&
    topicAfter === topicBefore;
  const dupOk =
    dupDelta === 0 &&
    mutationZero &&
    dupStatus === 409 &&
    String(dupBody?.code || "") === "SOURCE_BOARD_ALREADY_REGISTERED" &&
    String(dupBody?.existingSourceId || "") === sourceId &&
    String(dupBody?.error || pageError || "").includes("이미 등록된") &&
    !/duplicate key|unique constraint|23505/i.test(String(dupBody?.error || pageError || ""));

  report.steps.push({
    D: {
      ROW_COUNT_BEFORE: countBeforeDup,
      ROW_COUNT_AFTER: countAfterDup,
      DUPLICATE_DELTA: dupDelta,
      API_STATUS: dupStatus,
      RESPONSE_CODE: dupBody?.code ?? null,
      EXISTING_SOURCE_ID: dupBody?.existingSourceId ?? null,
      NAME_BEFORE: nameBefore,
      NAME_AFTER: nameAfter,
      NAME_MUTATION: nameAfter === nameBefore ? "NO" : "YES",
      CONFIG_MUTATION: mutationZero ? "NO" : "YES",
      UI_RESULT: pageError || dupBody?.error || null,
      BODY: dupBody,
    },
  });
  report.DUPLICATE_GUARD = pf(dupOk);
  if (!dupOk) {
    await browser.close();
    stop(
      "EXPECTED duplicate 409 + zero mutation; ACTUAL mismatch",
      "duplicate_guard_fail",
      {
        DUPLICATE_GUARD: "FAIL",
        ROW_COUNT_BEFORE: countBeforeDup,
        ROW_COUNT_AFTER: countAfterDup,
        DUPLICATE_DELTA: dupDelta,
        API_STATUS: dupStatus,
        NAME_BEFORE: nameBefore,
        NAME_AFTER: nameAfter,
        UI_RESULT: pageError || dupBody?.error || null,
      }
    );
    return;
  }

  // —— E. Edit / Update (explicit PATCH — must not share create upsert) ——
  const editedName = `${qaName} EDITED`;
  const patchRes = await page.request.patch(`${ORIGIN}/api/admin/community/external-board/boards/${sourceId}`, {
    data: { sourceBoardName: editedName },
  });
  const patchStatus = patchRes.status();
  const patchBody = await patchRes.json().catch(() => null);
  const afterPatch = await (
    await page.request.get(`${ORIGIN}/api/admin/community/external-board/boards/${sourceId}`)
  ).json().catch(() => null);
  const editOk =
    patchStatus === 200 &&
    patchBody?.ok === true &&
    String(afterPatch?.source?.source_board_name || "") === editedName &&
    String(afterPatch?.source?.rights_basis || "") === rightsBefore &&
    String(afterPatch?.source?.mode || "") === modeBefore;
  const editControls =
    (await page.locator('button:has-text("저장"), button:has-text("수정"), button:has-text("Update"), button:has-text("Save")').count()) >
    0;
  report.steps.push({
    E: {
      PATCH_STATUS: patchStatus,
      EDITED_NAME: editedName,
      READBACK_NAME: afterPatch?.source?.source_board_name ?? null,
      editControlsVisible: editControls,
      BODY: patchBody,
    },
  });
  report.EDIT_UPDATE = pf(editOk);
  if (!editOk) {
    await browser.close();
    stop("EXPECTED explicit PATCH edit mutates allowed field; ACTUAL fail", "edit_patch_failed", {
      EDIT_UPDATE: "FAIL",
      PATCH_STATUS: patchStatus,
      BODY: patchBody,
    });
    return;
  }

  // —— F. Verify CTA ——
  await page.goto(`${ORIGIN}${ROUTE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const sourceCard = page.locator("li").filter({ hasText: editedName }).first();
  const verifyBtn = sourceCard.getByRole("button", { name: "게시판 확인" });
  const hasVerify = (await verifyBtn.count()) > 0;
  if (!hasVerify) {
    await browser.close();
    stop("EXPECTED verify CTA on source card; ACTUAL missing", "verify_cta_missing", {
      VERIFY_CTA: "FAIL",
    });
    return;
  }
  const verifyWait = page.waitForResponse(
    (r) => r.url().includes(`/external-board/boards/${sourceId}/verify`) && r.request().method() === "POST",
    { timeout: 90000 }
  );
  await verifyBtn.click();
  const verifyRes = await verifyWait.catch(() => null);
  await page.waitForTimeout(2000);
  let verifyStatus = null;
  let verifyBody = null;
  if (verifyRes) {
    verifyStatus = verifyRes.status();
    verifyBody = await verifyRes.json().catch(() => null);
  }
  report.VERIFY_REQUEST = { STATUS: verifyStatus, BODY: verifyBody };
  report.VERIFY_RESULT = verifyBody?.check?.status ?? verifyBody?.status ?? verifyBody?.source?.check_status ?? null;
  report.VERIFY_OPERATOR_REASON = verifyBody?.check?.reasons ?? verifyBody?.reasons ?? verifyBody?.error ?? null;
  const verifyOk = verifyStatus === 200 && verifyBody?.ok === true;
  report.VERIFY_CTA = pf(verifyOk);
  report.steps.push({ F: { verifyOk, verifyStatus, verifyBody } });
  if (!verifyOk) {
    await browser.close();
    stop("EXPECTED verify POST ok; ACTUAL fail", "verify_failed", {
      VERIFY_CTA: "FAIL",
      VERIFY_REQUEST: report.VERIFY_REQUEST,
    });
    return;
  }

  // —— G. List / Detail / Retry ——
  const listAfter = await (await page.request.get(`${ORIGIN}/api/admin/community/external-board/boards`)).json();
  const listedAfter = (listAfter.sources || []).find((s) => s.id === sourceId);
  report.LIST = pf(Boolean(listedAfter));
  const detailAfter = await (
    await page.request.get(`${ORIGIN}/api/admin/community/external-board/boards/${sourceId}`)
  ).json();
  report.DETAIL = pf(detailAfter?.ok === true && detailAfter?.source?.id === sourceId);
  report.STATUS_VISIBILITY = pf(
    Boolean(listedAfter?.check_status) || (await page.content()).includes("check=")
  );
  // Retry verify once
  const retryRes = await page.request.post(`${ORIGIN}/api/admin/community/external-board/boards/${sourceId}/verify`);
  const retryBody = await retryRes.json().catch(() => null);
  report.RETRY = pf(retryRes.status() === 200 && retryBody?.ok === true);
  report.steps.push({
    G: {
      LIST: report.LIST,
      DETAIL: report.DETAIL,
      STATUS_VISIBILITY: report.STATUS_VISIBILITY,
      RETRY: report.RETRY,
      listedAfter,
    },
  });
  if (report.LIST !== "PASS" || report.DETAIL !== "PASS" || report.RETRY !== "PASS") {
    await browser.close();
    stop("EXPECTED list/detail/retry PASS; ACTUAL fail", "list_detail_retry_fail");
    return;
  }

  // —— H. QA cleanup (isolated fixture only) ——
  const sb = serviceSb();
  const { data: cleanupRow } = await sb
    .from("external_board_sources")
    .select("id, source_url")
    .eq("id", sourceId)
    .maybeSingle();
  if (cleanupRow && String(cleanupRow.source_url || "").includes("fixture.external-board.local/qa-operability-")) {
    const { error: delErr } = await sb.from("external_board_sources").delete().eq("id", sourceId);
    const { data: gone } = await sb.from("external_board_sources").select("id").eq("id", sourceId).maybeSingle();
    report.QA_CLEANUP = pf(!delErr && !gone);
  } else {
    report.QA_CLEANUP = "NOT_AVAILABLE";
  }

  report.ADMIN_AUTH = "PASS";
  report.NEW_ADMIN_UI = "PASS";
  report.REGISTER = "PASS";
  report.DB_PERSIST = "PASS";
  report.HARD_REFRESH = "PASS";
  report.REENTRY = "PASS";
  report.DUPLICATE_GUARD = "PASS";
  report.PRODUCTION_OPERABILITY =
    report.EDIT_UPDATE === "PASS" &&
    report.VERIFY_CTA === "PASS" &&
    report.LIST === "PASS" &&
    report.DETAIL === "PASS" &&
    report.RETRY === "PASS"
      ? "PASS"
      : "PARTIAL";
  report.FIRST_DIVERGENCE = null;
  report.ROOT_CAUSE = null;
  report.EDIT_UI_CONTROLS = editControls ? "PRESENT" : "ABSENT_API_PATCH_USED";

  await browser.close();
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
