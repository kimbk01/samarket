import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, type APIRequestContext, type Cookie, type Page } from "@playwright/test";

/** `playwright.config.ts` 의 `use.baseURL` 과 동일한 기본값 */
export function playwrightOriginFromEnv(): string {
  return (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Next dev 서버가 응답하는지 확인 */
export async function assertPlaywrightOriginReachable(request: APIRequestContext): Promise<void> {
  const origin = playwrightOriginFromEnv();
  const health = await request.get(origin).catch(() => null);
  if (!health) {
    throw new Error(
      `[E2E] ${origin} 에 연결할 수 없습니다(서버 미기동·포트 불일치·방화벽). ` +
        "`npm run dev` 로 Next 를 띄우거나, 이미 띄운 경우 `PLAYWRIGHT_NO_WEBSERVER=1` 로 Playwright 가 자체 webServer 를 켜지 않게 하세요."
    );
  }
  if (!health.ok() && health.status() !== 302 && health.status() !== 307 && health.status() !== 304) {
    throw new Error(`[E2E] ${origin} GET 이 비정상입니다 status=${health.status()}`);
  }
}

/** `create-cm-storage-state.mjs` 출력 또는 `PLAYWRIGHT_STORAGE_STATE` */
export function resolveE2eStorageStatePath(): string | null {
  const fromEnv = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();
  const candidate =
    fromEnv && fromEnv.length > 0
      ? path.resolve(fromEnv)
      : path.join(process.cwd(), "tests", "e2e", ".auth", "cm-storage.json");
  return fs.existsSync(candidate) ? candidate : null;
}

function loadEnvLocalForE2e(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function applyE2eStorageStateCookies(page: Page): Promise<boolean> {
  const file = resolveE2eStorageStatePath();
  if (!file) return false;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { cookies?: Cookie[] };
  if (!raw.cookies?.length) return false;
  await page.context().addCookies(raw.cookies);
  return true;
}

function e2eLoginCandidates(opts?: { username?: string; password?: string }): Array<{ id: string; pass: string }> {
  const envUser = opts?.username ?? process.env.E2E_TEST_USERNAME?.trim();
  const envPass = opts?.password ?? process.env.E2E_TEST_PASSWORD ?? "1234";
  if (envUser) {
    const bare = envUser.includes("@") ? envUser.split("@")[0]! : envUser;
    const emails = envUser.includes("@")
      ? [envUser]
      : [`${envUser}@manual.local`, `${envUser}@samarket.local`, envUser];
    return [...new Set(emails)].map((id) => ({ id, pass: envPass }));
  }
  return [
    { id: "aaaa@manual.local", pass: "1234" },
    { id: "aaaa@samarket.local", pass: "1234" },
    { id: "aaaa", pass: "1234" },
  ];
}

async function sessionProbeOk(page: Page, origin: string): Promise<boolean> {
  const settingsProbe = await page.request.get(`${origin}/api/me/settings`).catch(() => null);
  return settingsProbe?.ok() === true;
}

/** Supabase password 로그인 후 sb-*-auth-token 쿠키 주입 — UI 로그인보다 안정적 */
async function tryInjectSupabaseSessionCookies(
  page: Page,
  opts?: { username?: string; password?: string }
): Promise<boolean> {
  loadEnvLocalForE2e();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return false;
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  if (!ref) return false;
  const origin = new URL(playwrightOriginFromEnv());
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  for (const candidate of e2eLoginCandidates(opts)) {
    const email = candidate.id.includes("@") ? candidate.id : `${candidate.id}@manual.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: candidate.pass });
    if (error || !data.session) continue;
    const session = data.session;
    const cookieValue = encodeURIComponent(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      })
    );
    await page.context().addCookies([
      {
        name: `sb-${ref}-auth-token`,
        value: cookieValue,
        domain: origin.hostname,
        path: "/",
        expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
    if (await sessionProbeOk(page, playwrightOriginFromEnv())) return true;
  }
  return false;
}

async function tryUiLogin(page: Page, candidate: { id: string; pass: string }): Promise<boolean> {
  const origin = playwrightOriginFromEnv();
  await gotoWithRetry(page, `${origin}/login`);
  const submit = page.getByRole("button", { name: /^(로그인|Sign in)$/i });
  await expect(submit).toBeVisible({ timeout: 30_000 });
  const idInput = page.getByRole("textbox", { name: /Email or Login ID|이메일|로그인\s*ID/i });
  const passInput = page.locator('input[type="password"]').first();
  await expect(idInput).toBeVisible({ timeout: 15_000 });
  await idInput.fill(candidate.id);
  await passInput.fill(candidate.pass);
  await submit.click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
  } catch {
    /* try next candidate */
  }
  if (page.url().includes("/login")) return false;
  return sessionProbeOk(page, origin);
}

/** storageState · Supabase 쿠키 · UI 로그인 순으로 세션 확보 */
export async function ensureE2eUserSession(
  page: Page,
  opts?: { username?: string; password?: string }
): Promise<void> {
  const origin = playwrightOriginFromEnv();
  await assertPlaywrightOriginReachable(page.request);

  await applyE2eStorageStateCookies(page);
  if (await sessionProbeOk(page, origin)) return;

  if (await tryInjectSupabaseSessionCookies(page, opts)) return;

  for (const candidate of e2eLoginCandidates(opts)) {
    if (await tryUiLogin(page, candidate)) return;
  }

  const alertText = await page.locator('[role="alert"]').first().textContent().catch(() => "");
  throw new Error(
    "[E2E] 로그인 실패 — E2E_TEST_USERNAME·E2E_TEST_PASSWORD, " +
      "node tests/e2e/scripts/create-cm-storage-state.mjs 로 tests/e2e/.auth/cm-storage.json 생성, " +
      `또는 PLAYWRIGHT_STORAGE_STATE 를 설정하세요. alert=${String(alertText).slice(0, 200)} url=${page.url()}`
  );
}

/**
 * origin 헬스체크 + (page 가 있으면) 세션 확보.
 */
export async function assertPlaywrightOriginAndTestLogin(
  request: APIRequestContext,
  page?: Page,
  opts?: { username?: string; password?: string }
): Promise<void> {
  await assertPlaywrightOriginReachable(request);
  if (page) {
    await ensureE2eUserSession(page, opts);
  }
}

/** Turbopack 이중 로드·sessionStorage 미러까지 합쳐 E2E 스냅샷을 읽는다 */
export async function readMessengerVerificationSnap(page: Page): Promise<{
  appWidePhaseLastMs?: Record<string, number>;
  messengerRenderPerf?: Record<string, number>;
  appWidePerf?: Record<string, number>;
} | null> {
  try {
    return await page.evaluate(() => {
      const w = window as unknown as {
        getMessengerHomeVerificationSnapshot?: () => {
          appWidePhaseLastMs?: Record<string, number>;
          messengerRenderPerf?: Record<string, number>;
          appWidePerf?: Record<string, number>;
        };
        getAppWidePhaseLastMs?: () => Record<string, number>;
      };
      const base = w.getMessengerHomeVerificationSnapshot?.() ?? null;
      const phase = w.getAppWidePhaseLastMs?.() ?? base?.appWidePhaseLastMs ?? {};
      if (!base) {
        return Object.keys(phase).length > 0 ? { appWidePhaseLastMs: phase } : null;
      }
      return { ...base, appWidePhaseLastMs: phase };
    });
  } catch {
    return null;
  }
}

/** 거래 허브(`/trade-chats`) 행을 건너뛰고 CM `/rooms/[id]` 로 진입 */
export async function openMessengerRoomFromList(page: Page, index = 0): Promise<boolean> {
  const origin = playwrightOriginFromEnv();
  const rows = page.locator('[data-messenger-chat-row="true"] div[role="button"]');
  const count = await rows.count();
  let roomOpens = 0;
  for (let i = 0; i < count; i += 1) {
    await rows.nth(i).click();
    try {
      await page.waitForURL((url) => url.pathname.includes("/community-messenger/rooms/"), {
        timeout: 12_000,
      });
      if (roomOpens === index) return true;
      roomOpens += 1;
      await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-messenger-chat-row="true"]').first().waitFor({ timeout: 60_000 });
    } catch {
      const path = new URL(page.url()).pathname;
      if (path.includes("/trade-chats") || path.includes("/delivery-chats")) {
        await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
        await page.locator('[data-messenger-chat-row="true"]').first().waitFor({ timeout: 60_000 });
        continue;
      }
      break;
    }
  }
  const res = await page.request.get(`${origin}/api/community-messenger/bootstrap?lite=1`);
  const json = (await res.json().catch(() => null)) as { chats?: Array<{ id?: string }> } | null;
  const chats = Array.isArray(json?.chats) ? json!.chats! : [];
  const roomId = chats[index]?.id ?? chats[0]?.id;
  if (typeof roomId !== "string" || !roomId.trim()) return false;
  await gotoWithRetry(page, `${origin}/community-messenger/rooms/${encodeURIComponent(roomId.trim())}`);
  await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 });
  return true;
}

/** dev 서버 재시작·HMR 등으로 잠깐 끊길 때 net::ERR_ABORTED 완화 */
export async function gotoWithRetry(
  page: Page,
  url: string,
  opts?: { attempts?: number; waitMs?: number }
): Promise<void> {
  const attempts = opts?.attempts ?? 4;
  const waitMs = opts?.waitMs ?? 1200;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      return;
    } catch (e) {
      lastErr = e;
      const msg = String(e);
      const retryable =
        msg.includes("ERR_ABORTED") ||
        msg.includes("ERR_CONNECTION") ||
        msg.includes("NS_ERROR_NET") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("net::ERR");
      if (!retryable || i === attempts - 1) {
        throw e;
      }
      await page.waitForTimeout(waitMs);
    }
  }
  throw lastErr;
}
