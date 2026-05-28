import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const origin = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const outJson = path.join(repoRoot, "docs", "perf", "cm-r14-row-not-found-reproduction.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(page) {
  const candidates = [
    { id: process.env.E2E_TEST_USERNAME || "aaaa", pass: process.env.E2E_TEST_PASSWORD || "1234" },
    { id: "aaaa@samarket.local", pass: "1234" },
  ];
  for (const c of candidates) {
    await page.goto(`${origin}/login?next=%2Fcommunity-messenger`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "로그인", exact: true }) });
    await form.locator('input[type="text"]').first().fill(c.id);
    await form.locator('input[type="password"]').first().fill(c.pass);
    await form.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 40_000 }).catch(() => {});
    if (!page.url().includes("/login")) return;
  }
  throw new Error("login failed");
}

async function getPerfEventCursor(page) {
  return page.evaluate(() => (window.__cmPerfEvents ?? []).length);
}

async function getFirstRowEventsAfter(page, cursor) {
  return page.evaluate((start) => {
    const events = (window.__cmPerfEvents ?? []).slice(start);
    const isFirstRowEvent = (e) =>
      e &&
      typeof e === "object" &&
      (Object.prototype.hasOwnProperty.call(e, "first_row_blocker") ||
        Object.prototype.hasOwnProperty.call(e, "first_row_query_result") ||
        Object.prototype.hasOwnProperty.call(e, "first_row_commit_span_source"));
    return events.filter(isFirstRowEvent).map((e) => ({
      first_row_query_result: e.first_row_query_result ?? null,
      first_row_blocker_reason: e.first_row_blocker_reason ?? null,
      first_row_blocker: e.first_row_blocker ?? null,
      first_row_rows_count_at_query: e.first_row_rows_count_at_query ?? null,
      first_row_container_found: e.first_row_container_found ?? null,
      first_row_parent_hidden: e.first_row_parent_hidden ?? null,
      first_row_query_selector: e.first_row_query_selector ?? null,
      first_row_commit_span_source: e.first_row_commit_span_source ?? null,
    }));
  }, cursor);
}

async function openRoomFromList(page, picker) {
  await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await sleep(900);
  const rows = page.locator('[data-messenger-chat-row="true"]:not([data-messenger-pillar-row])');
  const count = await rows.count();
  if (count <= 0) return { ok: false, reason: "no_rows_in_home_list" };

  let idx = -1;
  for (let i = 0; i < count; i += 1) {
    const txt = ((await rows.nth(i).innerText().catch(() => "")) || "").trim();
    if (picker(txt, i)) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return { ok: false, reason: "no_matching_row" };

  const row = rows.nth(idx);
  const link = row.locator('a[href*="/community-messenger/rooms/"]').first();
  if ((await link.count()) > 0) await link.click({ timeout: 12_000 });
  else await row.click({ timeout: 12_000 });
  await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 }).catch(() => {});
  await sleep(1200);
  return { ok: true, roomUrl: page.url(), rowIndex: idx };
}

async function openDeliveryUnreadRoom(page) {
  await page.goto(`${origin}/community-messenger/delivery-chats?filter=unread`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await sleep(800);
  const rows = page.locator('[data-messenger-chat-row="true"]:not([data-messenger-pillar-row])');
  if ((await rows.count()) <= 0) return { ok: false, reason: "no_delivery_rows" };
  const badge = rows.filter({ has: page.locator('[data-cm-unread-badge="true"]') }).first();
  const target = (await badge.count()) > 0 ? badge : rows.first();
  const link = target.locator('a[href*="/community-messenger/rooms/"]').first();
  if ((await link.count()) > 0) await link.click({ timeout: 12_000 });
  else await target.click({ timeout: 12_000 });
  await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 }).catch(() => {});
  await sleep(1200);
  return { ok: true, roomUrl: page.url() };
}

async function runScenario(page, name, runner) {
  const cursor = await getPerfEventCursor(page);
  const exec = await runner();
  if (!exec.ok) return { scenario: name, reproduced: false, reason: exec.reason, events: [] };
  const events = await getFirstRowEventsAfter(page, cursor);
  return { scenario: name, reproduced: events.some((e) => String(e.first_row_blocker || "").startsWith("row_not_found")), reason: exec.reason || null, roomUrl: exec.roomUrl ?? null, events };
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await login(page);
await page.evaluate(() => {
  try {
    sessionStorage.setItem("samarket:debug:runtime", "1");
  } catch {
    /* */
  }
});

const results = [];

results.push(
  await runScenario(page, "cold_room_entry", async () =>
    openRoomFromList(page, (_txt, i) => i === 0)
  )
);

results.push(
  await runScenario(page, "quick_room_switch", async () => {
    const first = await openRoomFromList(page, (_txt, i) => i === 0);
    if (!first.ok) return first;
    await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await sleep(300);
    return openRoomFromList(page, (_txt, i) => i === 1);
  })
);

results.push(
  await runScenario(page, "burst_then_reentry", async () => {
    const first = await openRoomFromList(page, (_txt, i) => i === 0);
    if (!first.ok) return first;
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("samarket:cm:r3:synthetic-burst", {
          detail: { count: 40, intervalMs: 0, textPrefix: "R14 burst" },
        })
      );
    });
    await sleep(700);
    await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await sleep(300);
    if (first.roomUrl) {
      await page.goto(first.roomUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await sleep(1200);
      return { ok: true, roomUrl: first.roomUrl };
    }
    return { ok: false, reason: "missing_room_url" };
  })
);

results.push(
  await runScenario(page, "visibility_restore_then_room_entry", async () => {
    await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await sleep(350);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pageshow"));
    });
    await sleep(500);
    return openRoomFromList(page, (_txt, i) => i === 0);
  })
);

results.push(
  await runScenario(page, "delivery_unread_room_entry", async () => openDeliveryUnreadRoom(page))
);

results.push(
  await runScenario(page, "empty_room_entry", async () =>
    openRoomFromList(page, (txt) => /아직 메시지가 없|첫 인사|메시지 없음/i.test(txt))
  )
);

results.push(
  await runScenario(page, "media_room_entry", async () =>
    openRoomFromList(page, (txt) => /사진|이미지|image|video|동영상|gif|jpg|png/i.test(txt))
  )
);

await context.close();
await browser.close();

const summary = {
  capturedAt: new Date().toISOString(),
  origin,
  scenarios: results,
};
fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
