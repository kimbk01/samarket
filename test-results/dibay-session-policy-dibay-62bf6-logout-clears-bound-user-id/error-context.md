# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dibay-session-policy.spec.ts >> dibay session policy >> logout clears bound user id
- Location: tests/e2e/dibay-session-policy.spec.ts:49:7

# Error details

```
Error: [E2E] http://localhost:3000 GET 이 비정상입니다 status=500
```

# Test source

```ts
  1   | import fs from "node:fs";
  2   | import path from "node:path";
  3   | import { createClient } from "@supabase/supabase-js";
  4   | import { expect, type APIRequestContext, type Cookie, type Page } from "@playwright/test";
  5   | 
  6   | /** `playwright.config.ts` 의 `use.baseURL` 과 동일한 기본값 */
  7   | export function playwrightOriginFromEnv(): string {
  8   |   return (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  9   | }
  10  | 
  11  | /** Next dev 서버가 응답하는지 확인 */
  12  | export async function assertPlaywrightOriginReachable(request: APIRequestContext): Promise<void> {
  13  |   const origin = playwrightOriginFromEnv();
  14  |   const health = await request.get(origin).catch(() => null);
  15  |   if (!health) {
  16  |     throw new Error(
  17  |       `[E2E] ${origin} 에 연결할 수 없습니다(서버 미기동·포트 불일치·방화벽). ` +
  18  |         "`npm run dev` 로 Next 를 띄우거나, 이미 띄운 경우 `PLAYWRIGHT_NO_WEBSERVER=1` 로 Playwright 가 자체 webServer 를 켜지 않게 하세요."
  19  |     );
  20  |   }
  21  |   if (!health.ok() && health.status() !== 302 && health.status() !== 307 && health.status() !== 304) {
> 22  |     throw new Error(`[E2E] ${origin} GET 이 비정상입니다 status=${health.status()}`);
      |           ^ Error: [E2E] http://localhost:3000 GET 이 비정상입니다 status=500
  23  |   }
  24  | }
  25  | 
  26  | /** `create-cm-storage-state.mjs` 출력 또는 `PLAYWRIGHT_STORAGE_STATE` */
  27  | export function resolveE2eStorageStatePath(): string | null {
  28  |   const fromEnv = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();
  29  |   const candidate =
  30  |     fromEnv && fromEnv.length > 0
  31  |       ? path.resolve(fromEnv)
  32  |       : path.join(process.cwd(), "tests", "e2e", ".auth", "cm-storage.json");
  33  |   return fs.existsSync(candidate) ? candidate : null;
  34  | }
  35  | 
  36  | function loadEnvLocalForE2e(): void {
  37  |   const envPath = path.join(process.cwd(), ".env.local");
  38  |   if (!fs.existsSync(envPath)) return;
  39  |   for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  40  |     const trimmed = line.trim();
  41  |     if (!trimmed || trimmed.startsWith("#")) continue;
  42  |     const eq = trimmed.indexOf("=");
  43  |     if (eq < 1) continue;
  44  |     const key = trimmed.slice(0, eq).trim();
  45  |     let value = trimmed.slice(eq + 1).trim();
  46  |     if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
  47  |       value = value.slice(1, -1);
  48  |     }
  49  |     if (!process.env[key]) process.env[key] = value;
  50  |   }
  51  | }
  52  | 
  53  | async function applyE2eStorageStateCookies(page: Page): Promise<boolean> {
  54  |   const file = resolveE2eStorageStatePath();
  55  |   if (!file) return false;
  56  |   const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { cookies?: Cookie[] };
  57  |   if (!raw.cookies?.length) return false;
  58  |   await page.context().addCookies(raw.cookies);
  59  |   return true;
  60  | }
  61  | 
  62  | function e2eLoginCandidates(opts?: { username?: string; password?: string }): Array<{ id: string; pass: string }> {
  63  |   const envUser = opts?.username ?? process.env.E2E_TEST_USERNAME?.trim();
  64  |   const envPass = opts?.password ?? process.env.E2E_TEST_PASSWORD ?? "1234";
  65  |   if (envUser) {
  66  |     const bare = envUser.includes("@") ? envUser.split("@")[0]! : envUser;
  67  |     const emails = envUser.includes("@")
  68  |       ? [envUser]
  69  |       : [`${envUser}@manual.local`, `${envUser}@samarket.local`, envUser];
  70  |     return [...new Set(emails)].map((id) => ({ id, pass: envPass }));
  71  |   }
  72  |   return [
  73  |     { id: "aaaa@manual.local", pass: "1234" },
  74  |     { id: "aaaa@samarket.local", pass: "1234" },
  75  |     { id: "aaaa", pass: "1234" },
  76  |   ];
  77  | }
  78  | 
  79  | async function sessionProbeOk(page: Page, origin: string): Promise<boolean> {
  80  |   const settingsProbe = await page.request.get(`${origin}/api/me/settings`).catch(() => null);
  81  |   return settingsProbe?.ok() === true;
  82  | }
  83  | 
  84  | /** Supabase password 로그인 후 sb-*-auth-token 쿠키 주입 — UI 로그인보다 안정적 */
  85  | async function tryInjectSupabaseSessionCookies(
  86  |   page: Page,
  87  |   opts?: { username?: string; password?: string }
  88  | ): Promise<boolean> {
  89  |   loadEnvLocalForE2e();
  90  |   const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  91  |   const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  92  |   if (!url || !anon) return false;
  93  |   const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  94  |   if (!ref) return false;
  95  |   const origin = new URL(playwrightOriginFromEnv());
  96  |   const sb = createClient(url, anon, { auth: { persistSession: false } });
  97  |   for (const candidate of e2eLoginCandidates(opts)) {
  98  |     const email = candidate.id.includes("@") ? candidate.id : `${candidate.id}@manual.local`;
  99  |     const { data, error } = await sb.auth.signInWithPassword({ email, password: candidate.pass });
  100 |     if (error || !data.session) continue;
  101 |     const session = data.session;
  102 |     const cookieValue = encodeURIComponent(
  103 |       JSON.stringify({
  104 |         access_token: session.access_token,
  105 |         refresh_token: session.refresh_token,
  106 |         expires_at: session.expires_at,
  107 |         expires_in: session.expires_in,
  108 |         token_type: session.token_type,
  109 |         user: session.user,
  110 |       })
  111 |     );
  112 |     await page.context().addCookies([
  113 |       {
  114 |         name: `sb-${ref}-auth-token`,
  115 |         value: cookieValue,
  116 |         domain: origin.hostname,
  117 |         path: "/",
  118 |         expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  119 |         httpOnly: false,
  120 |         secure: origin.protocol === "https:",
  121 |         sameSite: "Lax",
  122 |       },
```