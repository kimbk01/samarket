/**
 * 로그인 세션 → Playwright storageState (APP-SHELL 검증용).
 * 실행: PLAYWRIGHT_NO_WEBSERVER=1 node tests/e2e/scripts/create-cm-storage-state.mjs
 *
 * 기본: E2E_TEST_USERNAME / E2E_TEST_PASSWORD 없으면 로그인 ID aaaa / 1234 시도 후
 *       실패 시 aaaa@samarket.local / 1234
 * 출력: tests/e2e/.auth/cm-storage.json (tests/e2e/.gitignore 에 .auth 포함)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const outDir = path.join(repoRoot, "tests", "e2e", ".auth");
const outFile = path.join(outDir, "cm-storage.json");

const origin = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const envUser = process.env.E2E_TEST_USERNAME?.trim();
const envPass = process.env.E2E_TEST_PASSWORD ?? "";
const candidates =
  envUser && envPass ?
    [{ label: "env", id: envUser.includes("@") ? envUser : `${envUser}@manual.local`, pass: envPass }]
  : [
      { label: "login_id_aaaa", id: "aaaa", pass: "1234" },
      { label: "samarket_local", id: "aaaa@samarket.local", pass: "1234" },
    ];

async function tryLogin(page, identifier, password) {
  await page.goto(`${origin}/login?next=%2Fcommunity-messenger`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const pwForm = page.locator("form").filter({ has: page.getByRole("button", { name: "로그인", exact: true }) });
  const idInput = pwForm.locator('input[type="text"]').first();
  const passInput = pwForm.locator('input[type="password"]').first();
  await idInput.click();
  await idInput.fill("");
  await idInput.pressSequentially(identifier, { delay: 15 });
  await passInput.click();
  await passInput.fill("");
  await passInput.pressSequentially(password, { delay: 15 });
  const idVal = await idInput.inputValue().catch(() => "");
  const pwLen = (await passInput.inputValue().catch(() => "")).length;
  if (!idVal.trim() || !pwLen) {
    await idInput.fill(identifier);
    await passInput.fill(password);
  }
  await pwForm.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 }).catch(() => {});
  const stillOnLogin = page.url().includes("/login");
  let loginAlert = null;
  if (stillOnLogin) {
    loginAlert = await page.locator('[role="alert"]').first().textContent().catch(() => null);
  }
  return { ok: !stillOnLogin, loginAlert };
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const consoleMsgs = [];
const pageErrors = [];
page.on("console", (m) => consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 400) }));
page.on("pageerror", (e) => pageErrors.push(String(e)));

let ok = false;
let used = null;
for (const c of candidates) {
  // 새 페이지로 이전 실패 폼 상태 제거
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
  const success = await tryLogin(page, c.id, c.pass);
  if (success.ok) {
    ok = true;
    used = { ...c, identifier: c.id };
    break;
  }
  if (success.loginAlert) {
    consoleMsgs.push({ type: "log", text: `login_failed_hint:${c.label}:${success.loginAlert.slice(0, 200)}` });
  }
}

if (!ok) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        tried: candidates,
        finalUrl: page.url(),
        pageErrors,
        tailConsole: consoleMsgs.slice(-15),
      },
      null,
      2
    )
  );
  await browser.close();
  process.exit(1);
}

await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 60_000 });
const finalUrl = page.url();
const onMessenger = finalUrl.includes("/community-messenger") && !finalUrl.includes("/login");

fs.mkdirSync(outDir, { recursive: true });
await context.storageState({ path: outFile });

console.log(
  JSON.stringify(
    {
      ok: true,
      used,
      storageStatePath: outFile,
      communityMessengerUrl: finalUrl,
      reachedMessengerShell: onMessenger,
      pageErrors,
      consoleErrors: consoleMsgs.filter((x) => x.type === "error"),
      consoleWarnings: consoleMsgs.filter((x) => x.type === "warning"),
    },
    null,
    2
  )
);

await browser.close();
