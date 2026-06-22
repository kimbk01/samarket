/**
 * APK WebView CDP helpers — Chrome/VIEW intent 금지, com.dibay.app WebView only.
 */
import { createClient } from "@supabase/supabase-js";

export const DIBAY_PKG = "com.dibay.app";

export function discoverWebViewSocket(adb, serial) {
  const r = adb(serial, "shell", "cat", "/proc/net/unix");
  const line = (r.stdout || "").split("\n").find((l) => l.includes("webview_devtools_remote"));
  if (!line) return null;
  const m = line.match(/@(webview_devtools_remote_\d+)/);
  return m?.[1] ?? null;
}

export function forwardCdp(adb, serial, port) {
  adb(serial, "forward", "--remove", `tcp:${port}`);
  const sock = discoverWebViewSocket(adb, serial);
  if (!sock) throw new Error(`webview devtools socket not found on ${serial}`);
  const f = adb(serial, "forward", `tcp:${port}`, `localabstract:${sock}`);
  if (f.status !== 0) throw new Error(`adb forward failed on ${serial}: ${f.stderr}`);
  return sock;
}

export async function connectWebView(chromium, port) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  return { browser, page };
}

export async function navigateApkWebView(page, url, waitMs = 3000) {
  await page.evaluate((u) => {
    window.location.href = u;
  }, url);
  await new Promise((r) => setTimeout(r, waitMs));
}

export async function probeApkUser(page) {
  return page.evaluate(async () => {
    try {
      const r = await fetch("/api/me/profile", { credentials: "include", cache: "no-store" });
      if (!r.ok) return { ok: false, status: r.status };
      const j = await r.json();
      const userId = String(j?.id ?? j?.profile?.id ?? j?.user?.id ?? "").trim();
      const username = String(j?.username ?? j?.profile?.username ?? "").toLowerCase();
      return { ok: true, userId, username };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
}

export async function buildApkSessionCookies({ login, prod, password, loadEnv }) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const loginEmail = login.includes("@") ? login : `${login}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail, password });
  if (error || !data.session) throw new Error(`login ${loginEmail}: ${error?.message ?? "no session"}`);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const host = new URL(prod).hostname;
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  const cookies = [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(JSON.stringify(session)),
      domain: host,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: prod.startsWith("https"),
      sameSite: "Lax",
    },
  ];
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", data.session.user.id)
      .maybeSingle();
    const activeSessionId = String(pr?.active_session_id ?? "").trim();
    if (activeSessionId) {
      cookies.push({
        name: "samarket_active_session_id",
        value: activeSessionId,
        domain: host,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 86400 * 30,
        httpOnly: false,
        secure: prod.startsWith("https"),
        sameSite: "Lax",
      });
    }
  }
  return { cookies, userId: data.session.user.id };
}

export async function logoutApkWebView(page) {
  await page.evaluate(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
  });
  await page.context().clearCookies();
  await new Promise((r) => setTimeout(r, 1000));
}

export function launchApkMainActivity(adb, serial, act) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "82");
  adb(serial, "shell", "am", "start", "-n", act);
}

export function restartApkForPushRegister(adb, serial, pkg, act, navigateUrl) {
  adb(serial, "logcat", "-c");
  adb(serial, "shell", "am", "force-stop", pkg);
  adb(serial, "shell", "am", "start", "-n", act);
  if (navigateUrl) {
    // VIEW with -p keeps intent inside app WebView (not Chrome).
    adb(serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", navigateUrl, "-p", pkg);
  }
}

/**
 * Ensure login in APK WebView via CDP cookie inject (not Chrome).
 * Returns { ok, probe, registerLogcat }.
 */
export async function ensureApkWebViewLogin({
  adb,
  chromium,
  serial,
  cdpPort,
  act,
  pkg,
  prod,
  login,
  expectedUserId,
  loadEnv,
  password,
  log,
  label,
  restartForFcm = true,
}) {
  loadEnv();
  launchApkMainActivity(adb, serial, act);
  await new Promise((r) => setTimeout(r, 3000));

  forwardCdp(adb, serial, cdpPort);
  const { browser, page } = await connectWebView(chromium, cdpPort);

  let probe = await probeApkUser(page);
  log(`${label} before login probe=${JSON.stringify(probe)}`);

  if (!(probe.ok && probe.userId === expectedUserId)) {
    if (probe.ok && probe.userId) {
      log(`${label} logout current user ${probe.userId}`);
      await logoutApkWebView(page);
    }
    const { cookies } = await buildApkSessionCookies({ login, prod, password, loadEnv });
    await page.context().addCookies(cookies);
    await navigateApkWebView(page, `${prod}/community-messenger`);
    probe = await probeApkUser(page);
    log(`${label} after inject probe=${JSON.stringify(probe)}`);
  }

  await browser.close().catch(() => {});

  if (!probe.ok || probe.userId !== expectedUserId) {
    return { ok: false, probe, registerLogcat: "" };
  }

  let registerLogcat = "";
  if (restartForFcm) {
    restartApkForPushRegister(adb, serial, pkg, act, `${prod}/community-messenger`);
    await new Promise((r) => setTimeout(r, 18000));
    registerLogcat = adb(serial, "logcat", "-d", "-s", "DIBAY_FCM", "DIBAY_PUSH_REGISTER", "DIBAY_PUSH", "DIBAY_NOTIFY").stdout ?? "";
    const tail = registerLogcat.split("\n").filter(Boolean).slice(-15);
    for (const line of tail) log(`${label} logcat ${line}`);
  }

  return { ok: true, probe, registerLogcat };
}

/** 기기에 이미 로그인된 WebView 세션 probe — 강제 aaaa/qqqq 주입 없음 */
export async function probeApkDeviceSession({
  adb,
  chromium,
  serial,
  cdpPort,
  act,
  prod,
  log,
  label,
}) {
  launchApkMainActivity(adb, serial, act);
  await new Promise((r) => setTimeout(r, 3000));
  forwardCdp(adb, serial, cdpPort);
  const { browser, page } = await connectWebView(chromium, cdpPort);
  await navigateApkWebView(page, `${prod}/community-messenger`, 4000);
  const probe = await probeApkUser(page);
  log(`${label} device session probe=${JSON.stringify(probe)}`);
  await browser.close().catch(() => {});
  return probe;
}

/** 로그인 유지 — FCM register tail 만 확인 (force-stop 후 재시작) */
export async function refreshApkFcmRegisterTail({
  adb,
  serial,
  pkg,
  act,
  prod,
  expectedUserId,
  log,
  label,
}) {
  restartApkForPushRegister(adb, serial, pkg, act, `${prod}/community-messenger`);
  await new Promise((r) => setTimeout(r, 18000));
  const registerLogcat =
    adb(serial, "logcat", "-d", "-s", "DIBAY_FCM", "DIBAY_PUSH_REGISTER", "DIBAY_PUSH", "DIBAY_NOTIFY").stdout ?? "";
  const tail = registerLogcat.split("\n").filter(Boolean).slice(-15);
  for (const line of tail) log(`${label} logcat ${line}`);
  const reg = [...registerLogcat.matchAll(/"user_id":"([^"]+)"/g)];
  const uid = reg.length ? reg[reg.length - 1][1] : null;
  if (expectedUserId && uid && uid !== expectedUserId) {
    log(`${label} WARN FCM user_id=${uid} expected=${expectedUserId}`);
  }
  return { registerLogcat, fcmUserId: uid };
}

export async function openUrlInApkWebView({
  adb,
  chromium,
  serial,
  cdpPort,
  act,
  prod,
  url,
  log,
  label,
}) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      launchApkMainActivity(adb, serial, act);
      await new Promise((r) => setTimeout(r, 2500));
      forwardCdp(adb, serial, cdpPort);
      const { browser, page } = await connectWebView(chromium, cdpPort);
      await navigateApkWebView(page, url, 4500);
      await browser.close().catch(() => {});
      log(`${label} navigated ${url}`);
      return;
    } catch (e) {
      lastErr = e;
      log(`${label} navigate attempt ${attempt + 1} failed: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr ?? new Error(`${label} navigate failed`);
}

export function foregroundPackageFromUiDump(xml) {
  const m = xml.match(/package="([^"]+)"/);
  return m?.[1] ?? null;
}

export function assertForegroundApk(xml, label, pkg = DIBAY_PKG) {
  const fg = foregroundPackageFromUiDump(xml);
  if (fg !== pkg) {
    const err = `${label}: foreground package=${fg ?? "unknown"} expected=${pkg} (Chrome/VIEW blocked)`;
    const e = new Error(err);
    e.foregroundPackage = fg;
    throw e;
  }
  return fg;
}
