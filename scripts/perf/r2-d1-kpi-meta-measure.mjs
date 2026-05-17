/**
 * R2-D1 KPI/meta stale measurement — 3 runs, measure only.
 * PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/perf/r2-d1-kpi-meta-measure.mjs
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const origin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ownerUser = process.env.E2E_OWNER_USERNAME?.trim() || "aa11";
const ownerPass = process.env.E2E_OWNER_PASSWORD ?? "1234";
const buyerUser = process.env.E2E_BUYER_USERNAME?.trim() || "aaaa";
const buyerPass = process.env.E2E_BUYER_PASSWORD ?? "1234";
const runs = Math.max(1, Number(process.env.R2D1_KPI_RUNS) || 3);
const outPath = process.env.R2D1_KPI_OUT ?? "messenger-r2-d1-kpi-measure.log";
const pollWaitMs = Number(process.env.R2D1_KPI_POLL_WAIT_MS) || 48_000;

async function login(page, user, pass) {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const email = page.getByPlaceholder("이메일 또는 로그인 ID");
  await email.waitFor({ state: "visible", timeout: 30_000 });
  await email.fill(user);
  await page.locator('input[type="password"]').fill(pass);
  const submit = page.getByRole("button", { name: /^로그인$/ });
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 90_000 }),
    submit.click(),
  ]);
}

function parseKpiLine(text) {
  const m = text.match(/\[dibay-r2d1-kpi\]\s+(\S+)\s+(\{[\s\S]*\})/);
  if (!m) return null;
  try {
    return { kind: m[1], data: JSON.parse(m[2]) };
  } catch {
    return { kind: m[1], raw: m[2] };
  }
}

function summarizeKpi(lines) {
  const counts = {};
  const events = [];
  for (const line of lines) {
    const p = parseKpiLine(line);
    if (!p) continue;
    counts[p.kind] = (counts[p.kind] ?? 0) + 1;
    events.push({ kind: p.kind, ...(p.data ?? {}) });
  }
  return { counts, events };
}

async function readApiSnapshot(page, storeId) {
  return page.evaluate(
    async ({ origin, storeId }) => {
      const base = `${origin}/api/me/stores/${encodeURIComponent(storeId)}`;
      const [listRes, metaRes] = await Promise.all([
        fetch(`${base}/orders`, { credentials: "include" }),
        fetch(`${base}/orders?meta_only=1`, { credentials: "include" }),
      ]);
      const listJson = await listRes.json().catch(() => ({}));
      const metaJson = await metaRes.json().catch(() => ({}));
      const orders = Array.isArray(listJson?.orders) ? listJson.orders : [];
      return {
        meta_pending_accept: Math.max(0, Number(metaJson?.meta?.pending_accept_count) || 0),
        meta_pending_delivery: Math.max(0, Number(metaJson?.meta?.pending_delivery_count) || 0),
        list_pending: orders.filter((o) => o?.order_status === "pending").length,
        list_preparing: orders.filter((o) => o?.order_status === "preparing").length,
        list_len: orders.length,
      };
    },
    { origin, storeId }
  );
}

async function readKpiWindow(page) {
  return page.evaluate(() => {
    const w = window.__R2D1_KPI_META__;
    if (!w) return { counts: {}, events: [] };
    return { counts: { ...w.counts }, events: [...(w.events ?? [])].slice(-40) };
  });
}

async function readDomSnapshot(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    const cardMatch = (label) => {
      const re = new RegExp(`${label}[\\s\\S]{0,40}?(\\d+)`, "m");
      const m = text.match(re);
      return m ? Number(m[1]) : null;
    };
    return {
      pendingCard: cardMatch("신규 주문"),
      preparingCard: cardMatch("조리중"),
      chipAccept: /접수 대기\s*(\d+)/.test(text) ? Number(text.match(/접수 대기\s*(\d+)/)[1]) : 0,
      chipAcceptVisible: text.includes("접수 대기"),
      chipDeliveryVisible: text.includes("배달 대기"),
      bannerAcceptVisible: text.includes("접수 대기 중인 주문이"),
      bannerDeliveryVisible: text.includes("배달 주문이 접수되었습니다"),
    };
  });
}

async function runOnce(runIndex) {
  const kpiLines = [];
  const httpLog = [];
  const timeline = [];

  const browser = await chromium.launch({ headless: true });
  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ownerCtx.addInitScript(() => {
    try {
      sessionStorage.setItem("dibay:r2d1:trace", "1");
      sessionStorage.setItem("dibay:r2d1:kpi", "1");
    } catch {
      /* ignore */
    }
  });
  const ownerPage = await ownerCtx.newPage();
  ownerPage.on("dialog", (d) => d.accept().catch(() => undefined));
  ownerPage.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[dibay-r2d1-kpi]")) kpiLines.push(t);
  });
  ownerPage.on("request", (req) => {
    const u = req.url();
    if (/\/api\/me\/stores\/[^/]+\/orders/.test(u) || /\/api\/me\/stores\/[^/]+\/order-counts/.test(u)) {
      httpLog.push({ at: Date.now(), method: req.method(), url: u });
    }
  });

  const run = {
    run: runIndex + 1,
    order_id: null,
    snapshots: [],
    errors: [],
    http_log: httpLog,
    timeline,
  };

  try {
    timeline.push({ step: "owner_login", at: Date.now() });
    await login(ownerPage, ownerUser, ownerPass);
    await ownerPage.goto(
      `${origin}/stores/owner/orders?kpi_verify=${Date.now()}`,
      { waitUntil: "domcontentloaded" }
    );
    await ownerPage.reload({ waitUntil: "networkidle", timeout: 120_000 }).catch(() =>
      ownerPage.reload({ waitUntil: "domcontentloaded" })
    );
    await ownerPage.waitForFunction(
      () => (document.body?.innerText ?? "").includes("신규 주문"),
      { timeout: 90_000 }
    );
    timeline.push({ step: "owner_orders_ready", at: Date.now() });

    const storesRes = await ownerPage.request.get(`${origin}/api/me/stores`);
    const storesJson = await storesRes.json().catch(() => ({}));
    const store = storesJson?.stores?.[0];
    if (!store?.id) throw new Error("owner_store_not_found");
    const storeId = store.id;

    const productsRes = await ownerPage.request.get(
      `${origin}/api/me/stores/${encodeURIComponent(storeId)}/products`
    );
    const productsJson = await productsRes.json().catch(() => ({}));
    const product =
      (productsJson?.products ?? productsJson?.items ?? []).find(
        (p) => p?.product_status === "active" || p?.status === "active"
      ) ?? (productsJson?.products ?? [])[0];
    if (!product?.id) throw new Error("no_active_product");

    const buyerCtx = await browser.newContext();
    const buyerPage = await buyerCtx.newPage();
    await login(buyerPage, buyerUser, buyerPass);

    const clientKey = `r2d1-kpi-${runIndex}-${Date.now()}`;
    const qty = Math.max(1, Number(product.min_order_qty) || 1);
    timeline.push({ step: "buyer_create_order", at: Date.now() });
    const orderCreate = await buyerPage.evaluate(
      async ({ origin, storeId, productId, qty, clientKey }) => {
        const addrRes = await fetch(`${origin}/api/me/addresses`, { credentials: "include" });
        const addrJson = await addrRes.json().catch(() => ({}));
        const savedAddr = addrJson?.addresses?.[0] ?? null;
        if (!savedAddr?.id) return { ok: false, error: "buyer_address_missing" };
        const addrSummary =
          String(savedAddr.formattedAddress ?? savedAddr.formatted_address ?? "").trim() ||
          "684-718, 1001 Paterno St, Quiapo, Manila";
        const addrDetail = String(savedAddr.detailAddress ?? savedAddr.detail_address ?? "").trim() || "R2-D1";
        const orderRes = await fetch(`${origin}/api/me/store-orders`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_id: storeId,
            fulfillment_type: "local_delivery",
            payment_method: "cod",
            buyer_phone: "09171234567",
            client_order_key: clientKey,
            delivery_user_address_id: savedAddr.id,
            delivery_address_summary: addrSummary,
            delivery_address_detail: addrDetail,
            delivery_region: "Metro Manila",
            delivery_city: "Manila",
            items: [{ product_id: productId, qty }],
          }),
        });
        const orderJson = await orderRes.json().catch(() => ({}));
        return { ok: orderRes.ok, orderJson };
      },
      { origin, storeId, productId: product.id, qty, clientKey }
    );
    if (!orderCreate.ok || !orderCreate.orderJson?.order?.id) {
      throw new Error(`order_create_failed:${JSON.stringify(orderCreate).slice(0, 200)}`);
    }
    run.order_id = orderCreate.orderJson.order.id;
    await buyerCtx.close();

    await ownerPage.waitForTimeout(5_000);
    const snapAfterInsert = await readDomSnapshot(ownerPage);
    const apiAfterInsert = await readApiSnapshot(ownerPage, storeId);
    const kpiAfterInsert = await readKpiWindow(ownerPage);
    run.snapshots.push({
      phase: "after_insert_rt",
      at: Date.now(),
      dom: snapAfterInsert,
      api: apiAfterInsert,
      kpi_window: kpiAfterInsert,
    });

    const httpBeforePatch = httpLog.length;
    const kpiBeforePatch = kpiLines.length;
    timeline.push({ step: "patch_pending_to_accepted", at: Date.now() });
    const statusPath = `${origin}/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(run.order_id)}`;
    await ownerPage.request.patch(statusPath, {
      data: { order_status: "accepted", estimated_prep_minutes: 15 },
    });
    await ownerPage.waitForTimeout(2_500);
    timeline.push({ step: "patch_accepted_to_preparing", at: Date.now() });
    await ownerPage.request.patch(statusPath, { data: { order_status: "preparing" } });
    await ownerPage.waitForTimeout(4_000);

    const snapPrePoll = await readDomSnapshot(ownerPage);
    const apiPrePoll = await readApiSnapshot(ownerPage, storeId);
    const kpiAfterPatch = summarizeKpi(kpiLines.slice(kpiBeforePatch));
    const kpiWindowPrePoll = await readKpiWindow(ownerPage);
    const httpAfterPatch = httpLog.slice(httpBeforePatch);
    run.snapshots.push({
      phase: "pre_poll_idle",
      at: Date.now(),
      dom: snapPrePoll,
      api: apiPrePoll,
      kpi_counts: kpiAfterPatch.counts,
      kpi_events: kpiAfterPatch.events,
      kpi_window: kpiWindowPrePoll,
      http_delta: httpAfterPatch,
      ownership_split:
        apiPrePoll.list_pending !== apiPrePoll.meta_pending_accept ||
        snapPrePoll.pendingCard !== snapPrePoll.chipAccept,
    });

    timeline.push({ step: "idle_before_poll", at: Date.now(), wait_ms: pollWaitMs });
    const httpBeforePollWait = httpLog.length;
    const kpiBeforePollWait = kpiLines.length;
    await ownerPage.waitForTimeout(pollWaitMs);

    const snapPostPoll = await readDomSnapshot(ownerPage);
    const apiPostPoll = await readApiSnapshot(ownerPage, storeId);
    const kpiAfterPoll = summarizeKpi(kpiLines.slice(kpiBeforePollWait));
    const kpiWindowPostPoll = await readKpiWindow(ownerPage);
    run.snapshots.push({
      phase: "post_poll",
      at: Date.now(),
      dom: snapPostPoll,
      api: apiPostPoll,
      kpi_counts: kpiAfterPoll.counts,
      kpi_events: kpiAfterPoll.events,
      kpi_window: kpiWindowPostPoll,
      http_delta: httpLog.slice(httpBeforePollWait),
    });

    const allKpi = summarizeKpi(kpiLines);
    run.kpi_counts = allKpi.counts;
    run.kpi_events = allKpi.events;

    const pre = snapPrePoll;
    const post = snapPostPoll;
    const apiPre = apiPrePoll;
    const insertSnap = run.snapshots.find((s) => s.phase === "after_insert_rt");
    const summaryRtOk =
      insertSnap?.dom?.pendingCard !== apiPrePoll?.list_pending ||
      apiPre.list_pending !== insertSnap?.api?.list_pending ||
      allKpi.counts.summary_counts_update > 0 ||
      (kpiWindowPrePoll?.counts?.summary_counts_update ?? 0) > 0;
    const insertDomAligned =
      insertSnap?.dom?.pendingCard != null &&
      insertSnap.dom.pendingCard === insertSnap.dom.chipAccept;
    const prePollDomAligned =
      pre.pendingCard != null && pre.pendingCard === pre.chipAccept;
    const metaStalePrePoll =
      !insertDomAligned ||
      (!prePollDomAligned &&
        (apiPre.list_pending !== apiPre.meta_pending_accept ||
          (insertSnap?.api &&
            insertSnap.api.list_pending !== insertSnap.api.meta_pending_accept)));
    const staleEvents = allKpi.events.filter((e) => e.kind === "stale_window_detected");
    const maxStaleMs = staleEvents.reduce(
      (m, e) => Math.max(m, Number(e.staleDurationMs) || 0),
      0
    );
    const metaRefreshedOnPoll =
      allKpi.counts.poll_meta_refresh > 0 ||
      allKpi.events.some((e) => e.kind === "meta_counts_update" && String(e.fetchReason).includes("poll"));
    const ordersGetsOnRt = httpLog.filter(
      (h) => h.method === "GET" && /\/orders(?:\?|$)/.test(h.url) && !h.url.includes("meta_only")
    );
    const orderCountsGets = httpLog.filter((h) => h.method === "GET" && /order-counts/.test(h.url));

    run.verdict = {
      summary_rt_updates: summaryRtOk,
      meta_stale_pre_poll_dom: metaStalePrePoll,
      stale_window_detected: staleEvents.length > 0,
      max_stale_duration_ms: maxStaleMs,
      meta_refreshed_on_poll: metaRefreshedOnPoll,
      chip_synced_post_poll:
        !post.chipAcceptVisible || post.chipAccept === post.pendingCard || post.pendingCard === 0,
      duplicate_orders_get_count: ordersGetsOnRt.length,
      order_counts_get_count: orderCountsGets.length,
    };
    run.pass =
      insertDomAligned &&
      prePollDomAligned &&
      !run.snapshots.some((s) => s.phase === "after_insert_rt" && s.dom?.pendingCard !== s.dom?.chipAccept);
  } catch (e) {
    run.errors.push(e instanceof Error ? e.message : String(e));
    run.pass = false;
    run.kpi_counts = summarizeKpi(kpiLines).counts;
  } finally {
    await ownerCtx.close();
    await browser.close();
  }

  return run;
}

async function main() {
  const allRuns = [];
  for (let i = 0; i < runs; i++) {
    console.log(`Run ${i + 1}/${runs}…`);
    allRuns.push(await runOnce(i));
  }

  const report = {
    captured_at: new Date().toISOString(),
    origin,
    owner: ownerUser,
    buyer: buyerUser,
    poll_wait_ms: pollWaitMs,
    runs: allRuns,
    aggregate: {
      pass_runs: allRuns.filter((r) => r.pass).length,
      total_runs: allRuns.length,
      ownership_split_proven: allRuns.every(
        (r) => r.verdict?.summary_rt_updates && (r.verdict?.stale_window_detected || r.verdict?.meta_stale_pre_poll_dom)
      ),
    },
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      pass_runs: report.aggregate.pass_runs,
      total: report.aggregate.total_runs,
      ownership_split_proven: report.aggregate.ownership_split_proven,
    })
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
