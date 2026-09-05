import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const ORIGIN = "https://samarket.vercel.app";
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const QA = `QA StoreOS x${Date.now()}`;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data } = await sb.auth.signInWithPassword({ email: "sadads@adsasdsa.com", password: "1234" });
const session = data.session;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
    domain: "samarket.vercel.app",
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  },
  ...(pr?.active_session_id
    ? [
        {
          name: "samarket_active_session_id",
          value: String(pr.active_session_id),
          domain: "samarket.vercel.app",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400 * 7,
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        },
      ]
    : []),
]);
const page = await context.newPage();
const posts = [];
page.on("response", async (r) => {
  if (r.request().method() === "GET") return;
  posts.push({
    m: r.request().method(),
    u: r.url(),
    s: r.status(),
    b: (await r.text().catch(() => "")).slice(0, 400),
  });
});
await page.goto(`${ORIGIN}/stores/owner/products/new?storeId=${STORE}`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2500);
for (let i = 0; i < 5; i++) {
  const b = page.getByRole("button", { name: /Don.t show|Close|오늘|닫기/i });
  if ((await b.count()) && (await b.first().isVisible().catch(() => false))) {
    await b.first().click({ force: true });
    await page.waitForTimeout(300);
  } else break;
}
const picker = page.locator("button").filter({ hasText: "Select a category" }).first();
const debug = {
  pickerCount: await picker.count(),
  pickerText: await picker.innerText().catch(() => null),
};
await picker.click({ force: true });
await page.waitForTimeout(800);
debug.options = await page.locator("[role=option]").allTextContents();
await page.locator("[role=option]").first().click({ force: true });
await page.waitForTimeout(400);
debug.pickerAfter = await page
  .locator("button")
  .filter({ hasText: /소주|김밥|만두|라면|CATEGORY|category/i })
  .first()
  .innerText()
  .catch(() => null);
await page
  .locator("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([inputmode=numeric])")
  .first()
  .fill(QA);
await page.locator("input[inputmode=numeric]").first().fill("123");
await page.locator("button").filter({ hasText: /^Save$/ }).last().click({ force: true });
await page.waitForTimeout(7000);
debug.after = {
  url: page.url(),
  sample: (await page.locator("body").innerText()).slice(0, 900),
  posts,
  qa: QA,
};
writeFileSync("docs/perf/owner-store-os-complete/recovery/product-save-debug2.json", JSON.stringify(debug, null, 2));
console.log(JSON.stringify(debug, null, 2));
await browser.close();
