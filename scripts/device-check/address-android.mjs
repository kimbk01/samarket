#!/usr/bin/env node
/**
 * DIBAY 주소 수정 — Android 실기기 자동 점검 (USB 연결 실기기 + 설치된 앱 WebView).
 *
 * 실행: node scripts/device-check/address-android.mjs
 * 전제: adb USB 연결 1대, 앱(com.dibay.app) 설치·로그인 상태, WebView 디버깅 가능한 빌드(debug APK).
 * 동작: 앱을 재시작해 WebView 에 붙고, 주소 화면을 실제로 조작해 항목별 PASS/FAIL 을 판정한다.
 * 결과: 표준출력 + /tmp/dibay-check/android/result.md, 스크린샷 /tmp/dibay-check/android/*.png
 * 정리: 점검 중 만든 주소(상세주소에 태그 포함)는 끝에 앱 UI 로 삭제한다. DB 를 직접 쓰지 않는다.
 */
import { _android as android } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const PKG = "com.dibay.app";
const OUT = "/tmp/dibay-check/android";
const TAG = `DCHK${String(Date.now()).slice(-6)}`;
mkdirSync(OUT, { recursive: true });

const results = [];
const meta = {};
let device;
let page;
let origin = "";

function adb(...args) {
  return execFileSync("adb", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(id) {
  try {
    await device.screenshot({ path: `${OUT}/${id}.png` });
    return `${OUT}/${id}.png`;
  } catch {
    return "";
  }
}

async function run(id, title, fn) {
  const t0 = Date.now();
  let r;
  try {
    r = await fn();
  } catch (e) {
    const msg = String(e?.message ?? e).split("\n")[0];
    r = { status: "FAIL", detail: `예외: ${msg}${msg.includes("URL=") ? "" : ` — ${await screenState()}`}` };
  }
  const evidence = await shot(id);
  results.push({ id, title, ...r, evidence, ms: Date.now() - t0 });
  console.log(`${id} ${r.status} — ${title}${r.detail ? ` — ${r.detail}` : ""}`);
}

/** 앱 부팅 직후 첫 화면 복원 이동이 끝날 때까지 — URL 이 5초간 그대로면 안정 */
async function waitForStableUrl(maxMs = 45000) {
  const end = Date.now() + maxMs;
  let last = page.url();
  let since = Date.now();
  while (Date.now() < end) {
    await sleep(500);
    const cur = page.url();
    if (cur !== last) {
      last = cur;
      since = Date.now();
    } else if (Date.now() - since >= 5000) {
      return;
    }
  }
}

/** 이동 후 앱이 다른 화면으로 돌려보내면 안정될 때까지 기다렸다가 다시 이동 (최대 3회) */
async function gotoPath(path) {
  const want = path.split("?")[0];
  for (let i = 0; i < 3; i++) {
    await page.goto(origin + path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await sleep(1500);
    if (new URL(page.url()).pathname === want) return;
    await waitForStableUrl(20000);
  }
  throw new Error(`${path} 로 이동해도 다른 화면으로 돌아감 — ${await screenState()}`);
}

/** 현재 화면 상태 한 줄 — 실패 원인 보고용 (URL + 화면 글자 앞부분) */
async function screenState() {
  try {
    const url = page.url();
    const text = await page.evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 240));
    return `URL=${url} | 화면="${text}"`;
  } catch (e) {
    return `화면 상태 읽기 실패: ${String(e?.message ?? e).split("\n")[0]}`;
  }
}

/** 화면 전환 애니메이션 중엔 이전·다음 화면이 동시에 그려진다 — 대상이 1개만 남을 때까지 대기 */
async function waitSingle(selector, timeout = 8000) {
  await page
    .waitForFunction((sel) => document.querySelectorAll(sel).length === 1, selector, { timeout })
    .catch(() => {});
  return page.locator(selector).last();
}

/** 바텀시트 등장 애니메이션이 끝나 화면 안에 들어올 때까지 */
async function waitSheetSettled() {
  await page.locator(".dibay-overlay-sheet").last().waitFor({ timeout: 10000 });
  await page
    .waitForFunction(() => {
      const els = document.querySelectorAll(".dibay-overlay-sheet");
      const el = els[els.length - 1];
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.bottom <= window.innerHeight + 1 && r.top >= 0;
    }, null, { timeout: 5000 })
    .catch(() => {});
  await sleep(300);
}

/** 실제 손가락 탭 — CSS 좌표 × devicePixelRatio 를 adb input tap 으로 */
async function adbTapLocator(loc) {
  const box = await loc.boundingBox();
  if (!box) throw new Error("탭 대상 요소 위치를 찾지 못함");
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
  // WebView 가 화면 맨 위에서 시작하지 않을 수 있다 — 실제 WebView 화면 위치를 더한다
  let ox = 0;
  let oy = 0;
  try {
    const info = await device.info({ clazz: "android.webkit.WebView" });
    ox = info.bounds.x;
    oy = info.bounds.y;
  } catch {
    /* 위치를 못 읽으면 0 기준 */
  }
  const x = Math.round(ox + (box.x + box.width / 2) * dpr);
  const y = Math.round(oy + (box.y + box.height / 2) * dpr);
  await device.shell(`input tap ${x} ${y}`);
}

async function rowCount() {
  try {
    await page.waitForSelector('[data-testid="address-row"], [data-testid="address-empty-add"]', { timeout: 45000 });
  } catch {
    throw new Error(`주소 목록이 45초 안에 표시되지 않음 — ${await screenState()}`);
  }
  return page.locator('[data-testid="address-row"]').count();
}

/** 클라이언트 라우팅(push/replace) 횟수 계측 */
async function installNavCounter() {
  await page.evaluate(() => {
    const w = window;
    if (w.__dchkNav) return;
    w.__dchkNav = [];
    for (const k of ["pushState", "replaceState"]) {
      const orig = history[k].bind(history);
      history[k] = (s, t, u) => {
        w.__dchkNav.push(`${k}:${String(u ?? "")}`);
        return orig(s, t, u);
      };
    }
  });
}
const navLog = () => page.evaluate(() => window.__dchkNav ?? []);

async function searchAndWaitResults(q, minRows = 1) {
  await gotoPath("/mypage/addresses/search");
  const input = page.locator('input[type="search"]').first();
  await input.waitFor({ timeout: 20000 });
  await input.fill("");
  await input.fill(q);
  const rows = page.locator("ul li button");
  await page.waitForFunction((n) => document.querySelectorAll("ul li button").length >= n, minRows, { timeout: 20000 });
  return { input, rows };
}

async function selectFirstResultToEdit() {
  const { rows } = await searchAndWaitResults("SM North EDSA");
  await rows.first().click();
  await page.waitForURL(/\/mypage\/addresses\/edit/, { timeout: 20000 });
  await page.locator("#addr-editor-detail").first().waitFor({ timeout: 20000 });
  await waitSingle("#addr-editor-detail");
}

async function setNetwork(on) {
  const v = on ? "enable" : "disable";
  adb("shell", "svc", "wifi", v);
  adb("shell", "svc", "data", v);
  await sleep(on ? 6000 : 2500);
}

async function openRowMenu(rowLocator) {
  await rowLocator.locator('[data-testid="address-row-more"]').click();
  await waitSheetSettled();
}

async function clickSheetItem(label) {
  await page.locator(".dibay-overlay-action-list button", { hasText: label }).last().click();
}

// ───────────────────────── 사전 조건 ─────────────────────────
async function preflight() {
  const devs = adb("devices").split("\n").slice(1).filter((l) => /\tdevice$/.test(l));
  if (devs.length !== 1) throw new Error(`adb 연결 기기 ${devs.length}대 (정확히 1대 필요)`);
  meta.serial = devs[0].split("\t")[0];
  meta.overWifi = meta.serial.includes(":");
  meta.model = adb("shell", "getprop", "ro.product.model");
  const dump = adb("shell", "dumpsys", "package", PKG);
  meta.versionName = (dump.match(/versionName=(\S+)/) || [])[1] || "?";
  meta.versionCode = (dump.match(/versionCode=(\d+)/) || [])[1] || "?";
  if (meta.versionName === "?") throw new Error(`${PKG} 미설치`);

  [device] = await android.devices();
  await device.shell(`am force-stop ${PKG}`);
  await device.shell(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
  await sleep(8000);
  let webview;
  try {
    webview = await device.webView({ pkg: PKG }, { timeout: 30000 });
  } catch {
    throw new Error("앱 WebView 에 연결 불가 — WebView 디버깅이 꺼진 빌드(release). debug APK 로 설치 후 재실행");
  }
  page = await webview.page();
  page.setDefaultTimeout(20000);
  await waitForStableUrl();
  origin = new URL(page.url()).origin;
  meta.origin = origin;
  await gotoPath("/mypage/addresses");
  if (/\/login|\/auth/.test(page.url())) throw new Error("앱이 로그아웃 상태 — 앱에서 회원 로그인 후 재실행");
  await rowCount();
  meta.rowsBefore = await page.locator('[data-testid="address-row"]').count();
}

// ───────────────────────── 점검 항목 ─────────────────────────
async function A1() {
  const before = await rowCount();
  await selectFirstResultToEdit();
  await page.locator("#addr-editor-detail").last().fill(`${TAG} A1`);
  await page.locator('[data-testid="address-detail-save"]').click();
  await page.waitForURL((u) => !/\/edit/.test(u.pathname), { timeout: 20000 });
  await gotoPath("/mypage/addresses");
  const after = await rowCount();
  const has = await page.locator('[data-testid="address-row"]', { hasText: `${TAG} A1` }).count();
  return after === before + 1 && has === 1
    ? { status: "PASS", detail: `목록 ${before}→${after}` }
    : { status: "FAIL", detail: `목록 ${before}→${after}, 새 주소 표시 ${has}개` };
}

async function A2() {
  await gotoPath("/mypage/addresses/search");
  const input = page.locator('input[type="search"]').first();
  await input.waitFor();
  const wrap = input.locator("xpath=..");
  const before = await wrap.evaluate((el) => ({ b: getComputedStyle(el).borderColor, s: getComputedStyle(el).boxShadow, h: el.getBoundingClientRect().height }));
  await input.focus();
  await sleep(300);
  const after = await wrap.evaluate((el) => ({ b: getComputedStyle(el).borderColor, s: getComputedStyle(el).boxShadow, h: el.getBoundingClientRect().height }));
  const fontPx = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await input.fill("abc");
  const clear = page.locator('[data-testid="address-search-clear"]');
  const clearVisible = await clear.isVisible();
  if (clearVisible) await clear.click();
  const value = await input.inputValue();
  const focused = await input.evaluate((el) => document.activeElement === el);
  const focusChanged = before.b !== after.b || before.s !== after.s;
  const sameHeight = Math.abs(before.h - after.h) < 0.5;
  const ok = focusChanged && sameHeight && fontPx >= 16 && clearVisible && value === "" && focused;
  return {
    status: ok ? "PASS" : "FAIL",
    detail: `포커스표시 ${focusChanged ? "O" : "X"}, 높이유지 ${sameHeight ? "O" : "X"}(${before.h}→${after.h}), 글자 ${fontPx}px, 지우기버튼 ${clearVisible ? "O" : "X"}, 지운 후 값 '${value}', 포커스유지 ${focused ? "O" : "X"}`,
  };
}

async function A3() {
  const { rows } = await searchAndWaitResults("SM North", 2);
  await installNavCounter();
  const b1 = rows.nth(0);
  const b2 = rows.nth(1);
  await b1.click({ noWaitAfter: true });
  const lockedDuring = await b2.isDisabled().catch(() => false);
  await b2.click({ force: true, noWaitAfter: true, timeout: 2000 }).catch(() => {});
  await page.waitForURL(/\/mypage\/addresses\/edit/, { timeout: 20000 });
  await sleep(2500);
  const nav = (await navLog()).filter((x) => x.includes("/mypage/addresses/edit"));
  return nav.length <= 1 && lockedDuring
    ? { status: "PASS", detail: `상세 이동 ${nav.length}회, 처리 중 다른 결과 비활성` }
    : { status: "FAIL", detail: `상세 이동 ${nav.length}회, 처리 중 다른 결과 비활성 ${lockedDuring ? "O" : "X"}` };
}

async function A4() {
  if (meta.overWifi) return { status: "NOT_RUN", detail: "adb 가 Wi-Fi 연결이라 네트워크 차단 불가 — USB 로 연결 후 재실행" };
  // 앞 항목에서 쓰지 않은 장소 — 장소 상세 캐시로 오프라인에서도 성공하는 것을 피한다
  const { rows } = await searchAndWaitResults("Greenbelt 5 Makati");
  await setNetwork(false);
  try {
    // 실제로 끊겼는지 확인 — 안 끊겼으면 판정 불가
    const reach = await page.evaluate(async () => {
      try {
        await fetch(`https://maps.googleapis.com/generate_204?t=${Date.now()}`, { mode: "no-cors", cache: "no-store" });
        return "reachable";
      } catch {
        return "offline";
      }
    });
    if (reach !== "offline") {
      return { status: "NOT_RUN", detail: `adb 로 Wi-Fi·데이터를 꺼도 인터넷이 연결됨(navigator 기준 ${reach}) — 네트워크 차단 불가` };
    }
    await rows.first().click();
    const alert = page.locator('[role="alert"]', { hasText: "주소를 불러오지 못했습니다" });
    const shown = await alert.waitFor({ timeout: 20000 }).then(() => true, () => false);
    const stayed = /\/mypage\/addresses\/search/.test(page.url());
    return shown && stayed
      ? { status: "PASS", detail: "오프라인 선택 시 오류 안내 표시, 검색 화면 유지" }
      : { status: "FAIL", detail: `오류 안내 ${shown ? "O" : "X"}, 검색 화면 유지 ${stayed ? "O" : "X"} — ${await screenState()}` };
  } finally {
    await setNetwork(true);
  }
}

async function A5() {
  adb("shell", "pm", "revoke", PKG, "android.permission.ACCESS_FINE_LOCATION");
  adb("shell", "pm", "revoke", PKG, "android.permission.ACCESS_COARSE_LOCATION");
  try {
    await gotoPath("/mypage/addresses");
    await page.getByRole("button", { name: /현재 위치로 찾기/ }).click();
    // 시스템 권한 창이 뜨면 거부
    for (let i = 0; i < 3; i++) {
      await sleep(1500);
      await device.tap({ text: /허용\s*안\s*함|허용하지\s*않음|거부|Don.t allow|Deny/ }, { timeout: 1500 }).catch(() => {});
    }
    const msg = page.getByText("설정에서 권한을 확인하거나 주소를 검색해 주세요.");
    const shown = await msg.waitFor({ timeout: 50000 }).then(() => true, () => false);
    if (!shown) {
      let sysTexts = "";
      try {
        adb("shell", "uiautomator", "dump", "/sdcard/dchk-ui.xml");
        const xml = adb("shell", "cat", "/sdcard/dchk-ui.xml");
        sysTexts = [...xml.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).slice(0, 25).join(" / ");
      } catch {
        sysTexts = "UI 덤프 실패";
      }
      return { status: "FAIL", detail: `권한 거부 후 안내 문구 미표시(50초) — 화면 글자: ${sysTexts.slice(0, 400)} — ${await screenState()}` };
    }
    return shown
      ? { status: "PASS", detail: "권한 거부 안내 문구 표시" }
      : { status: "FAIL", detail: "권한 거부 후 안내 문구 미표시(50초)" };
  } finally {
    await page.keyboard.press("Escape").catch(() => {});
    adb("shell", "pm", "grant", PKG, "android.permission.ACCESS_FINE_LOCATION");
    adb("shell", "pm", "grant", PKG, "android.permission.ACCESS_COARSE_LOCATION");
  }
}

async function A6() {
  await selectFirstResultToEdit();
  const detail = page.locator("#addr-editor-detail").last();
  await detail.fill(`${TAG} A6`);
  await sleep(800); // 초안 디바운스(300ms) 이후
  // ① Android 뒤로 → 이탈 확인 창 → 계속 수정
  const dirtyAttr = await page.evaluate(() => document.querySelector('[data-testid="address-detail-save"]')?.hasAttribute("disabled") ?? null);
  try { adb("logcat", "-c"); } catch { /* ignore */ }
  await device.shell("input keyevent 4");
  const dlg = page.getByText("수정한 내용을 버릴까요?");
  const dialogShown = await dlg.waitFor({ timeout: 8000 }).then(() => true, () => false);
  let backDiag = "";
  if (!dialogShown) {
    await shot("A6-after-back");
    let log = "";
    try {
      log = adb("logcat", "-d", "-t", "400")
        .split("\n")
        .filter((l) => /backButton|onBackPressed|Capacitor\/App|OnBackPressed/i.test(l))
        .slice(-6)
        .join(" ¦ ");
    } catch {
      log = "logcat 실패";
    }
    backDiag = ` — 뒤로 후 ${await screenState()} | 저장버튼 disabled=${dirtyAttr} | logcat: ${log || "관련 로그 없음"}`;
  }
  if (dialogShown) await page.getByRole("button", { name: "계속 수정" }).click();
  const kept = (await detail.inputValue().catch(() => "")) === `${TAG} A6`;
  // ② 확인 없이 이탈(iOS 스와이프와 같은 history.back) → 재진입 시 초안 복원
  await page.evaluate(() => history.back());
  await sleep(1500);
  await selectFirstResultToEdit();
  const restoredNotice = await page.locator('[data-testid="address-edit-draft-restored"]').isVisible().catch(() => false);
  const restoredValue = (await page.locator("#addr-editor-detail").last().inputValue()) === `${TAG} A6`;
  if (restoredNotice) await page.locator('[data-testid="address-edit-draft-restored"] button').click().catch(() => {});
  const cleared = (await page.locator("#addr-editor-detail").last().inputValue()) === "";
  const ok = dialogShown && kept && restoredNotice && restoredValue && cleared;
  return {
    status: ok ? "PASS" : "FAIL",
    detail: `뒤로→확인창 ${dialogShown ? "O" : "X"}, 계속수정 후 입력유지 ${kept ? "O" : "X"}, 재진입 복원안내 ${restoredNotice ? "O" : "X"}, 값복원 ${restoredValue ? "O" : "X"}, 처음부터→비움 ${cleared ? "O" : "X"}${backDiag}`,
  };
}

async function A7() {
  if (!/\/edit/.test(page.url())) await selectFirstResultToEdit();
  const hints = await page.evaluate(() => {
    const ta = document.querySelector("#addr-editor-detail");
    const inputs = [...document.querySelectorAll('input[placeholder^="예:"]')];
    return [ta?.getAttribute("enterkeyhint"), ...inputs.map((i) => i.getAttribute("enterkeyhint"))];
  });
  const landmark = page.locator('input[placeholder^="예: 초록 대문"]').last();
  const note = page.locator('input[placeholder^="예: 문 앞에"]').last();
  const checks = [];
  for (const [name, loc] of [["랜드마크", landmark], ["메모", note]]) {
    const box = await loc.boundingBox();
    if (!box) { checks.push(`${name}:요소없음`); continue; }
    await adbTapLocator(loc);
    await sleep(1500);
    const r = await page.evaluate((sel) => {
      const vv = window.visualViewport;
      const el = document.querySelector(sel);
      const save = document.querySelector('[data-testid="address-detail-save"]');
      const top = vv ? vv.offsetTop : 0;
      const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const kb = vv ? window.innerHeight - vv.height > 120 : false;
      const er = el?.getBoundingClientRect();
      const sr = save?.getBoundingClientRect();
      return {
        kb,
        inputVisible: !!er && er.top >= top && er.bottom <= bottom,
        saveVisible: !!sr && sr.top >= top && sr.bottom <= bottom + 1,
      };
    }, name === "랜드마크" ? 'input[placeholder^="예: 초록 대문"]' : 'input[placeholder^="예: 문 앞에"]');
    checks.push(`${name}:키보드${r.kb ? "O" : "X"}/입력칸보임${r.inputVisible ? "O" : "X"}/저장버튼보임${r.saveVisible ? "O" : "X"}`);
    if (!r.kb) return { status: "NOT_RUN", detail: `소프트 키보드가 열리지 않음 (${checks.join(", ")})` };
    if (!r.inputVisible || !r.saveVisible) return { status: "FAIL", detail: checks.join(", ") };
  }
  await device.shell("input keyevent 111").catch(() => {}); // ESC 로 키보드 닫기
  const hintOk = hints[0] === "next" && hints.includes("next") && hints.includes("done");
  return hintOk
    ? { status: "PASS", detail: `${checks.join(", ")}, 엔터키 ${hints.join("/")}` }
    : { status: "FAIL", detail: `${checks.join(", ")}, 엔터키 힌트 ${hints.join("/")}` };
}

async function A8() {
  await selectFirstResultToEdit();
  await page.locator("#addr-editor-detail").last().fill(`${TAG} A8`);
  const save = page.locator('[data-testid="address-detail-save"]');
  await Promise.all([0, 1, 2].map(() => save.click({ force: true, noWaitAfter: true, timeout: 3000 }).catch(() => {})));
  await page.waitForURL((u) => !/\/edit/.test(u.pathname), { timeout: 20000 }).catch(() => {});
  await gotoPath("/mypage/addresses");
  await rowCount();
  const n = await page.locator('[data-testid="address-row"]', { hasText: `${TAG} A8` }).count();
  return n === 1 ? { status: "PASS", detail: "저장 3회 연타 → 1개 생성" } : { status: "FAIL", detail: `저장 3회 연타 → ${n}개 생성` };
}

async function A9() {
  await gotoPath("/mypage/addresses");
  await rowCount();
  const badge = () => page.locator('[data-testid="address-row"]', { hasText: "현재 주소" }).count();
  const target = page.locator('[data-testid="address-row"]', { hasText: `${TAG} A8` }).first();
  await openRowMenu(target);
  await clickSheetItem("대표로 설정");
  await page.getByText("대표 주소로 설정했어요").waitFor({ timeout: 15000 }).catch(() => {});
  await sleep(1000);
  const afterSet = await badge();
  const masterIsTarget = await target.filter({ hasText: "현재 주소" }).count();
  const victim = page.locator('[data-testid="address-row"]', { hasText: `${TAG} A1` }).first();
  await openRowMenu(victim);
  await clickSheetItem("삭제");
  await page.getByRole("dialog").getByRole("button", { name: "삭제" }).last().click();
  await page.getByText("주소를 삭제했어요").waitFor({ timeout: 15000 }).catch(() => {});
  await sleep(1000);
  const afterDel = await badge();
  const victimLeft = await page.locator('[data-testid="address-row"]', { hasText: `${TAG} A1` }).count();
  const ok = afterSet === 1 && masterIsTarget === 1 && afterDel === 1 && victimLeft === 0;
  return {
    status: ok ? "PASS" : "FAIL",
    detail: `대표설정 후 배지 ${afterSet}개(대상 ${masterIsTarget ? "O" : "X"}), 삭제 후 배지 ${afterDel}개, 삭제 대상 남음 ${victimLeft}`,
  };
}

async function A10() {
  await gotoPath("/mypage/addresses");
  await rowCount();
  await openRowMenu(page.locator('[data-testid="address-row"]').first());
  const gap = await page.evaluate(() => {
    const els = document.querySelectorAll(".dibay-overlay-sheet");
    const el = els[els.length - 1];
    return el ? Math.round(window.innerHeight - el.getBoundingClientRect().bottom) : -1;
  });

  await page.keyboard.press("Escape").catch(() => {});
  await device.shell("input keyevent 4").catch(() => {});
  return gap >= 0 && gap <= 48
    ? { status: "PASS", detail: `시트 아래 여백 ${gap}px (safe-area 이내)` }
    : { status: "FAIL", detail: `시트 아래 여백 ${gap}px (하단에서 떠 있음)` };
}

async function A11() {
  await gotoPath("/mypage/addresses");
  await rowCount();
  const row = page.locator('[data-testid="address-row"]', { hasText: `${TAG} A8` }).first();
  await openRowMenu(row);
  await clickSheetItem("수정");
  await page.waitForURL(/\/edit/, { timeout: 20000 });
  await waitSingle("#addr-editor-detail");
  const long = `${TAG}A11Unit1234567890Tower2BuildingAWing3Floor45`;
  await page.locator("#addr-editor-detail").last().fill(long);
  await page.locator('[data-testid="address-detail-save"]').click();
  await page.waitForURL((u) => !/\/edit/.test(u.pathname), { timeout: 20000 });
  await gotoPath("/mypage/addresses");
  await rowCount();
  const r = await page.evaluate((txt) => {
    const row = [...document.querySelectorAll('[data-testid="address-row"]')].find((el) => el.textContent?.includes(txt));
    const doc = document.documentElement;
    const scrollers = [...document.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "hidden" && getComputedStyle(el).overflowX !== "clip" && el.clientWidth > 0);
    return {
      found: !!row,
      rowOverflow: row ? row.scrollWidth > row.clientWidth + 1 : true,
      pageOverflow: doc.scrollWidth > window.innerWidth + 1,
      hScrollable: scrollers.length,
    };
  }, long);
  const ok = r.found && !r.rowOverflow && !r.pageOverflow;
  return {
    status: ok ? "PASS" : "FAIL",
    detail: `행 발견 ${r.found ? "O" : "X"}, 카드 넘침 ${r.rowOverflow ? "있음" : "없음"}, 화면 가로 넘침 ${r.pageOverflow ? "있음" : "없음"}`,
  };
}

async function C2() {
  await gotoPath("/philife/write");
  await sleep(4000);
  const text = await page.evaluate(() => document.body.innerText);
  const leaksTag = text.includes(TAG);
  const detailPattern = /\b(unit|rm|room|floor|flr|blk|lot)\s*\d|\d+\s*(동|호|층)\b/i.test(text.split("\n").filter((l) => l.length < 60).join("\n"));
  return !leaksTag && !detailPattern
    ? { status: "PASS", detail: "글쓰기 화면 지역 표시에 상세주소 패턴 없음" }
    : { status: "FAIL", detail: `상세주소 노출 의심 (태그 ${leaksTag ? "O" : "X"}, 동·호·Unit 패턴 ${detailPattern ? "O" : "X"})` };
}

async function C3() {
  await gotoPath("/market");
  await sleep(3000);
  await installNavCounter();
  const pin = page.getByRole("button", { name: /^거래 지역/ }).first();
  await pin.waitFor({ timeout: 15000 });
  await Promise.all([pin.click({ noWaitAfter: true }), pin.click({ force: true, noWaitAfter: true, timeout: 2000 }).catch(() => {})]);
  await page.waitForURL(/\/market\/location/, { timeout: 15000 });
  await sleep(1500);
  const pushes = (await navLog()).filter((x) => x.startsWith("pushState:") && x.includes("/market/location")).length;
  await page.evaluate(() => history.back());
  await sleep(2000);
  const backOk = !/\/market\/location/.test(new URL(page.url()).pathname);
  return pushes <= 1 && backOk
    ? { status: "PASS", detail: `위치 화면 push ${pushes}회, 뒤로 1번에 복귀` }
    : { status: "FAIL", detail: `위치 화면 push ${pushes}회, 뒤로 1번에 복귀 ${backOk ? "O" : "X"}` };
}

async function E1() {
  const prevAuto = adb("shell", "settings", "get", "system", "accelerometer_rotation");
  const prevRot = adb("shell", "settings", "get", "system", "user_rotation");
  try {
    await gotoPath("/mypage/addresses");
    adb("shell", "settings", "put", "system", "accelerometer_rotation", "0");
    adb("shell", "settings", "put", "system", "user_rotation", "1");
    await sleep(3000);
    const r = await page.evaluate(() => ({ type: screen.orientation?.type ?? "", w: window.innerWidth, h: window.innerHeight, over: document.documentElement.scrollWidth > window.innerWidth + 1 }));
    const isPhone = !/tablet/i.test(adb("shell", "getprop", "ro.build.characteristics"));
    if (isPhone) {
      return r.type.startsWith("portrait") && r.h > r.w
        ? { status: "PASS", detail: `폰 세로 고정 유지 (${r.type})` }
        : { status: "FAIL", detail: `폰이 가로로 회전됨 (${r.type} ${r.w}x${r.h})` };
    }
    return r.w > r.h && !r.over
      ? { status: "PASS", detail: `태블릿 가로 ${r.w}x${r.h}, 가로 넘침 없음` }
      : { status: "FAIL", detail: `태블릿 ${r.type} ${r.w}x${r.h}, 가로 넘침 ${r.over ? "있음" : "없음"}` };
  } finally {
    adb("shell", "settings", "put", "system", "user_rotation", prevRot || "0");
    adb("shell", "settings", "put", "system", "accelerometer_rotation", prevAuto || "1");
  }
}

async function cleanup() {
  try {
    await gotoPath("/mypage/addresses");
    await rowCount();
    for (let i = 0; i < 6; i++) {
      const row = page.locator('[data-testid="address-row"]', { hasText: TAG }).first();
      if ((await row.count()) === 0) break;
      await openRowMenu(row);
      await clickSheetItem("삭제");
      await page.getByRole("dialog").getByRole("button", { name: "삭제" }).last().click();
      await sleep(2000);
    }
    const left = await page.locator('[data-testid="address-row"]', { hasText: TAG }).count();
    meta.cleanup = left === 0 ? "점검용 주소 모두 삭제" : `점검용 주소 ${left}개 남음 — 주소 설정에서 ${TAG} 포함 주소 삭제 필요`;
  } catch (e) {
    meta.cleanup = `정리 실패: ${String(e?.message ?? e).split("\n")[0]} — 주소 설정에서 ${TAG} 포함 주소 삭제 필요`;
  }
}

// ───────────────────────── 실행 ─────────────────────────
/** A6 원인 진단 — 뒤로 버튼 신호가 앱 화면(JS)까지 오는지, 보이지 않게 열린 오버레이가 있는지 */
async function A6probe() {
  await selectFirstResultToEdit();
  await page.locator("#addr-editor-detail").last().fill(`${TAG} P6`);
  await sleep(1200);
  const before = await page.evaluate(async () => {
    const cap = window.Capacitor;
    const w = window;
    w.__probeBack = 0;
    let listenerOk = "no-plugin";
    try {
      const App = cap?.Plugins?.App;
      if (App?.addListener) {
        await App.addListener("backButton", () => {
          w.__probeBack += 1;
        });
        listenerOk = "added";
      }
    } catch (e) {
      listenerOk = `error:${String(e?.message ?? e)}`;
    }
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].map((d) => {
      const r = d.getBoundingClientRect();
      const st = getComputedStyle(d);
      return `${(d.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}|${Math.round(r.width)}x${Math.round(r.height)}|vis=${st.visibility}|op=${st.opacity}`;
    });
    return {
      platform: cap?.getPlatform?.() ?? "none",
      native: cap?.isNativePlatform?.() ?? null,
      listenerOk,
      dialogs,
      saveDisabled: document.querySelector('[data-testid="address-detail-save"]')?.hasAttribute("disabled") ?? null,
    };
  });
  await sleep(500);
  await device.shell("input keyevent 4");
  await sleep(2500);
  const after = await page.evaluate(() => ({
    probeBack: window.__probeBack ?? -1,
    url: location.pathname,
    confirmShown: (document.body.innerText ?? "").includes("수정한 내용을 버릴까요?"),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].length,
  }));
  return {
    status: "PROBE",
    detail: `platform=${before.platform} native=${before.native} 테스트리스너=${before.listenerOk} 뒤로전/열린dialog=${before.dialogs.length}[${before.dialogs.join(" ; ")}] 저장disabled=${before.saveDisabled} → 뒤로후 테스트리스너수신=${after.probeBack} url=${after.url} 확인창=${after.confirmShown ? "O" : "X"} dialog수=${after.dialogs}`,
  };
}

if (process.argv.includes("--probe-a6")) {
  let f = "";
  try {
    await preflight();
    await run("A6probe", "A6 뒤로 버튼 진단", A6probe);
    await cleanup();
  } catch (e) {
    f = String(e?.message ?? e).split("\n")[0];
  }
  const out = `[A6 진단] ${meta.model ?? "?"} 앱 ${meta.versionName ?? "?"}(${meta.versionCode ?? "?"})\n${f ? `중단: ${f}` : results.map((r) => `${r.id} ${r.status}: ${r.detail}`).join("\n")}`;
  writeFileSync(`${OUT}/probe-a6.md`, out);
  console.log(out);
  process.exit(0);
}

const ITEMS = [
  ["A1", "주소 추가 → 검색 → 결과 선택 → 상세 입력 → 저장", A1],
  ["A2", "검색창 포커스 표시·높이 유지·16px·지우기 버튼", A2],
  ["A3", "검색 결과 연타 시 상세 화면 1번만 이동", A3],
  ["A4", "오프라인 결과 선택 시 오류 안내", A4],
  ["A5", "위치 권한 거부 안내", A5],
  ["A6", "입력 중 뒤로 확인창 · 재진입 초안 복원", A6],
  ["A7", "키보드가 입력칸·저장 버튼을 가리지 않음", A7],
  ["A8", "저장 3회 연타 시 주소 1개만 생성", A8],
  ["A9", "대표 변경·삭제 후 대표 1개 유지", A9],
  ["A10", "주소 메뉴 시트가 화면 하단에 붙음", A10],
  ["A11", "긴 상세주소 카드 넘침·가로 스크롤 없음", A11],
  ["C2", "Philife 글쓰기 지역에 상세주소 없음", C2],
  ["C3", "거래 지역 핀 연타 시 위치 화면 1번만", C3],
  ["E1", "기기 회전 (폰 세로 고정 / 태블릿 가로)", E1],
];

let fatal = "";
try {
  await preflight();
  for (const [id, title, fn] of ITEMS) await run(id, title, fn);
  await cleanup();
} catch (e) {
  fatal = String(e?.message ?? e).split("\n")[0];
  if (page) {
    await shot("fatal");
    if (!fatal.includes("URL=")) fatal += ` — ${await screenState()}`;
  }
}

const lines = [
  `[DIBAY 주소 Android 실기기 자동 점검] ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Manila" })} PHT`,
  `기기: ${meta.model ?? "?"} (${meta.serial ?? "?"}) · 앱 ${meta.versionName ?? "?"} (${meta.versionCode ?? "?"}) · ${meta.origin ?? ""}`,
  fatal ? `중단: ${fatal}` : `정리: ${meta.cleanup ?? "-"}`,
  "",
  "| 항목 | 결과 | 확인 내용 | 증거 |",
  "|---|---|---|---|",
  ...results.map((r) => `| ${r.id} ${r.title} | ${r.status} | ${r.detail ?? ""} | ${r.evidence || "-"} |`),
  "",
  `PASS ${results.filter((r) => r.status === "PASS").length} · FAIL ${results.filter((r) => r.status === "FAIL").length} · NOT_RUN ${results.filter((r) => r.status === "NOT_RUN").length}`,
  "자동화 범위 밖(코드 단위 테스트로 검증): B1~B4 장바구니·주문, C1 대표 주소 변경 반영, D1·D2 매장 오너",
];
const report = lines.join("\n");
writeFileSync(`${OUT}/result.md`, report);
console.log("\n" + report);
process.exit(fatal ? 2 : results.some((r) => r.status === "FAIL") ? 1 : 0);
