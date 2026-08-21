/**
 * Cold /mypage owner-entry runtime proof.
 *
 * Proves first paint with empty OwnerLite + empty me-stores TTL:
 * - pending/rejected must NOT show 「매장 신청」
 * - must show 「매장 승인 진행 사항」 (or status label)
 * - href → /stores/owner (no /apply)
 * - no GET /api/me/stores list fetch on that first paint
 *
 * Usage:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 *   node --env-file=.env.local scripts/qa/mypage-store-entry-cold-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = resolve(process.cwd(), "docs/perf/mypage-store-entry-cold");
const OUT = resolve(OUT_DIR, "cold-runtime-latest.json");
const OWNER_LITE_KEY = "samarket:stores:owner-lite:snapshot:v1";

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

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_MEMBER_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

async function loginSession(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session;
  }
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) throw new Error(`login_failed:${email}:${linkErr?.message || "no_token"}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${email}:${otpErr?.message || "no_session"}`);
  return verified.session;
}

async function injectAuth(context, session) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data: pr } = await admin
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  const activeSessionId = String(pr?.active_session_id ?? "").trim() || null;
  const ref = new URL(url).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  await context.addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        })
      ),
      domain: origin.hostname,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
    ...(activeSessionId
      ? [
          {
            name: "dibay_active_session_id",
            value: activeSessionId,
            domain: origin.hostname,
            path: "/",
            expires: Math.floor(Date.now() / 1000) + 3600,
            httpOnly: false,
            secure: origin.protocol === "https:",
            sameSite: "Lax",
          },
        ]
      : []),
  ]);
}

async function ensurePendingFixture(sb) {
  const { data: existing } = await sb
    .from("stores")
    .select("id, owner_user_id, approval_status, store_name, slug")
    .in("approval_status", ["pending", "under_review", "revision_requested", "rejected", "suspended"])
    .limit(5);
  if (existing?.length) {
    const row = existing[0];
    const { data: profile } = await sb
      .from("profiles")
      .select("id, username, email, auth_login_email")
      .eq("id", row.owner_user_id)
      .maybeSingle();
    return {
      mode: "existing",
      store: row,
      login: profile?.auth_login_email || profile?.email || null,
      userId: row.owner_user_id,
      restore: null,
    };
  }

  // No pending rows: temporarily flip a known QA approved store → pending, then restore.
  const { data: approved } = await sb
    .from("stores")
    .select("id, owner_user_id, approval_status, store_name, slug, is_visible")
    .eq("slug", "asas22")
    .maybeSingle();
  if (!approved?.id) throw new Error("no_pending_store_and_no_asas22_flip_target");

  const { data: profile } = await sb
    .from("profiles")
    .select("id, username, email, auth_login_email")
    .eq("id", approved.owner_user_id)
    .maybeSingle();
  const prev = {
    approval_status: approved.approval_status,
    is_visible: approved.is_visible,
  };
  const { error: upErr } = await sb
    .from("stores")
    .update({ approval_status: "pending", is_visible: false })
    .eq("id", approved.id);
  if (upErr) throw new Error(`pending_flip_failed:${upErr.message}`);
  return {
    mode: "flipped",
    store: { ...approved, approval_status: "pending", is_visible: false },
    login: profile?.auth_login_email || profile?.email || "asas22@manual.local",
    userId: approved.owner_user_id,
    restore: async () => {
      await sb
        .from("stores")
        .update({ approval_status: prev.approval_status, is_visible: prev.is_visible })
        .eq("id", approved.id);
    },
  };
}

async function main() {
  loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const sb = createClient(url, sk, { auth: { persistSession: false } });

  const fixture = await ensurePendingFixture(sb);
  const report = {
    at: new Date().toISOString(),
    origin: ORIGIN,
    fixture: {
      mode: fixture.mode,
      storeId: fixture.store.id,
      approval_status: fixture.store.approval_status,
      userId: fixture.userId,
      login: fixture.login,
    },
    firstPaint: null,
    afterSettle: null,
    meStoresGets: [],
    verdicts: {},
  };

  let restoreErr = null;
  const browser = await chromium.launch({ headless: true });
  try {
    if (!fixture.login) throw new Error("fixture_login_missing");
    const session = await loginSession(fixture.login);
    const context = await browser.newContext();
    // Cold: wipe OwnerLite before any document runs. Memory TTL starts empty in new process.
    await context.addInitScript((key) => {
      try {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }, OWNER_LITE_KEY);
    await injectAuth(context, session);

    const page = await context.newPage();
    const meStoresGets = [];
    page.on("request", (req) => {
      const u = req.url();
      if (req.method() === "GET" && /\/api\/me\/stores(?:\?|$)/.test(u)) {
        meStoresGets.push({ url: u, at: Date.now() });
      }
    });

    const navStart = Date.now();
    await page.goto(`${ORIGIN}/mypage`, { waitUntil: "domcontentloaded", timeout: 90_000 });

    // First paint probe as soon as store section row exists (or timeout).
    const firstPaint = await page
      .waitForFunction(
        () => {
          const section = Array.from(document.querySelectorAll("section, [class*='MenuSection'], div")).find((el) =>
            /매장\s*\/\s*주문|Store\s*\/\s*orders/i.test(el.textContent || "")
          );
          if (!section) return null;
          const links = Array.from(section.querySelectorAll("a[href]"));
          const row = links.find((a) => {
            const href = a.getAttribute("href") || "";
            return (
              href.includes("/stores/owner") ||
              /매장\s*신청|매장\s*승인|매장\s*진입|Apply for store|Store approval|Enter store|Register my store/i.test(
                a.textContent || ""
              )
            );
          });
          if (!row) return null;
          return {
            href: row.getAttribute("href") || "",
            text: (row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
            ownerLiteRaw: sessionStorage.getItem("samarket:stores:owner-lite:snapshot:v1"),
          };
        },
        { timeout: 20_000 }
      )
      .then((h) => h.jsonValue())
      .catch(() => null);

    report.firstPaint = {
      ...firstPaint,
      elapsedMs: Date.now() - navStart,
      meStoresGetsSoFar: meStoresGets.length,
    };

    await page.waitForTimeout(2500);
    const afterSettle = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const row = anchors.find((a) => {
        const href = a.getAttribute("href") || "";
        const t = a.textContent || "";
        return (
          href.includes("/stores/owner") ||
          /매장\s*신청|매장\s*승인|매장\s*진입|Apply for store|Store approval|Enter store|Register my store/i.test(t)
        );
      });
      return row
        ? {
            href: row.getAttribute("href") || "",
            text: (row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
            ownerLiteRaw: sessionStorage.getItem("samarket:stores:owner-lite:snapshot:v1"),
          }
        : null;
    });
    report.afterSettle = afterSettle;
    report.meStoresGets = meStoresGets;

    const fp = report.firstPaint;
    const showsApply =
      !!fp &&
      (/매장\s*신청|Apply for store|Register my store|내 상점 등록/i.test(String(fp.text || "")) ||
        String(fp.href || "").includes("/stores/owner/apply"));
    const showsProgress =
      !!fp &&
      (/매장\s*승인\s*진행|Store approval progress|신청대기|검토중|보완요청|반려|운영\s*정지|Pending|Under review|Rejected/i.test(
        String(fp.text || "")
      ) ||
        (String(fp.href || "") === "/stores/owner" ||
          /^\/stores\/owner(\?|$)/.test(String(fp.href || ""))));
    const hrefOk =
      !!fp &&
      /^\/stores\/owner(\?|$)/.test(String(fp.href || "")) &&
      !String(fp.href || "").includes("/apply");
    const noListFetch = meStoresGets.length === 0;

    report.verdicts = {
      FIRST_PAINT_NOT_APPLY: showsApply ? "FAIL" : fp ? "PASS" : "FAIL",
      FIRST_PAINT_PROGRESS: showsProgress && hrefOk ? "PASS" : "FAIL",
      HREF_OWNER_HUB: hrefOk ? "PASS" : "FAIL",
      NO_ME_STORES_LIST_FETCH: noListFetch ? "PASS" : "FAIL",
      RUNTIME_COLD_MYPAGE:
        !showsApply && showsProgress && hrefOk && noListFetch ? "PASS" : "FAIL",
    };

    if (fp?.href && hrefOk) {
      await page.click(`a[href="${fp.href}"]`).catch(() => {});
      await page.waitForTimeout(800);
      report.clickLandedPath = new URL(page.url()).pathname;
    }

    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close().catch(() => {});
    if (typeof fixture.restore === "function") {
      try {
        await fixture.restore();
      } catch (e) {
        restoreErr = String(e?.message || e);
      }
    }
  }
  if (restoreErr) {
    console.error("RESTORE_ERR", restoreErr);
    process.exit(3);
  }
  process.exit(report.verdicts.RUNTIME_COLD_MYPAGE === "PASS" ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
