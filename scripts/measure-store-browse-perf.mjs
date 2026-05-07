import { chromium } from "@playwright/test";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureLoginViaLoginPage(page, baseUrl) {
  const user = process.env.E2E_TEST_USERNAME?.trim();
  const pass = process.env.E2E_TEST_PASSWORD ?? "";
  if (!user || !pass) {
    throw new Error(
      "E2E_TEST_USERNAME / E2E_TEST_PASSWORD가 필요합니다. " +
        "현재 서버가 /login으로 리다이렉트되며, 임시 test-login API는 제거되었습니다."
    );
  }
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator('input[type="text"], input[type="email"]').first().fill(user);
  await page.locator('input[type="password"]').first().fill(pass);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/login" && !url.pathname.startsWith("/login/"), {
    timeout: 45_000,
  });
}

async function runOnce(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (msg) => {
    const txt = msg.text();
    if (txt.includes("[dibay-store-browse-perf]")) logs.push(txt);
  });

  await page.goto(`${baseUrl}/stores/browse/restaurant?sub=korean`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await ensureLoginViaLoginPage(page, baseUrl);
    await page.goto(`${baseUrl}/stores/browse/restaurant?sub=korean`, { waitUntil: "domcontentloaded" });
  }

  const tap = async (sub) => {
    await page.click(`button[data-sub="${sub}"]`, { timeout: 10_000 });
    await sleep(250);
  };

  await tap("western");
  await tap("snack");
  await tap("western");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await sleep(400);

  await browser.close();
  return logs;
}

const baseUrl = process.env.BASE_URL || "http://192.168.100.7:3000";
const runs = Number(process.env.RUNS || "3");

for (let i = 1; i <= runs; i += 1) {
  // eslint-disable-next-line no-console
  console.log(`--- store-browse-perf run ${i}/${runs} ---`);
  const logs = await runOnce(baseUrl);
  // eslint-disable-next-line no-console
  console.log(logs.join("\n") || "(no perf logs captured)");
}

