#!/usr/bin/env npx tsx
/**
 * DIBAY Address SSOT — full Runtime matrix (8 gates).
 * Evidence only; does not change product code.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "@playwright/test";
import {
  formatAddressBookLine,
  formatAddressBookLineSegments,
  formatDeliveryAddress,
  formatPublicAddress,
} from "@/lib/addresses/user-address-format";
import { resolveUserAddressTitle } from "@/lib/addresses/user-address-display-ssot";
import { listUserAddresses, createUserAddress } from "@/lib/addresses/user-address-service";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import {
  publicRegionLabelLeaksPrivateDetail,
  resolveCommunityPublicRegionLabelForUser,
} from "@/lib/addresses/community-public-region-label";
import { allowEditTradeLocationSnapshot } from "@/lib/trade/trade-lifecycle-policy";
import type { UserAddressDTO, UserAddressWritePayload } from "@/lib/addresses/user-address-types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGIN = (process.env.ADDRESS_RUNTIME_ORIGIN || "http://127.0.0.1:3010").replace(/\/$/, "");
const LOGIN = process.env.GATE4_RECEIVER_LOGIN || process.env.QA_MEMBER_LOGIN || "qqqq";
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/address-ssot-runtime-matrix-${STAMP}`);
fs.mkdirSync(OUT, { recursive: true });

type Gate = { status: "PASS" | "FAIL" | "HOLD"; detail?: Record<string, unknown>; error?: string };

function loadEnv() {
  for (const rel of [".env.local", ".env", ".env.vercel.production"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
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

function passwords(): string[] {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_MEMBER_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter((x): x is string => Boolean(x)),
    ),
  ];
}

const log = (m: string) => {
  console.log(m);
  fs.appendFileSync(path.join(OUT, "run.log"), m + "\n");
};

function pf(ok: boolean): "PASS" | "FAIL" {
  return ok ? "PASS" : "FAIL";
}

async function loginMember(): Promise<{
  session: Session;
  sb: SupabaseClient;
  admin: SupabaseClient | null;
  cookies: Array<Record<string, unknown>>;
  accessToken: string;
}> {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session: Session | null = null;
  for (const email of [`${LOGIN}@manual.local`, `${LOGIN}@dibay.local`, `${LOGIN}@samarket.local`]) {
    for (const password of passwords()) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        session = data.session;
        break;
      }
    }
    if (session) break;
  }
  if (!session) throw new Error(`login fail: ${LOGIN}`);
  const ref = new URL(url).hostname.split(".")[0];
  const host = new URL(ORIGIN).hostname;
  const cookiePayload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: "bearer",
    user: session.user,
  };
  const cookies: Array<Record<string, unknown>> = [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(JSON.stringify(cookiePayload)),
      domain: host,
      path: "/",
      httpOnly: false,
      secure: ORIGIN.startsWith("https"),
      sameSite: "Lax",
    },
  ];
  const admin = sk ? createClient(url, sk, { auth: { persistSession: false } }) : null;
  if (admin) {
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    if (pr?.active_session_id) {
      cookies.push({
        name: "samarket_active_session_id",
        value: encodeURIComponent(String(pr.active_session_id)),
        domain: host,
        path: "/",
        httpOnly: false,
        secure: ORIGIN.startsWith("https"),
        sameSite: "Lax",
      });
    }
  }
  return { session, sb, admin, cookies, accessToken: session.access_token };
}

async function apiJson(
  cookieHeader: string,
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${ORIGIN}${pathname}`, {
    method,
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function cookieHeaderFromList(cookies: Array<Record<string, unknown>>): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

function countryLeak(s: string | null | undefined) {
  return /PHILIPPINES|Philippines|필리핀/i.test(s || "");
}

function publicLeak(s: string | null | undefined) {
  return /Unit\s|Room\s|Floor|House No|Barangay|Street|Avenue|Subdivision|PHILIPPINES/i.test(s || "");
}

async function gateAddressAdd(sb: SupabaseClient, cookieHeader: string, userId: string): Promise<Gate> {
  const stamp = Date.now();
  const hit = mapUserAddressToAppLocation({
    id: "tmp",
    userId,
    labelType: "home",
    linkedStoreId: null,
    nickname: null,
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: "Metro Manila",
    cityMunicipality: "Pasig City",
    barangay: "San Antonio",
    district: null,
    streetAddress: "123 Maharlika Street",
    buildingName: "Greenview Subdivision",
    unitFloorRoom: `Unit 4B QA${stamp}`,
    landmark: null,
    latitude: 14.5764,
    longitude: 121.0851,
    placeId: `ChIJ_QA_PASIG_${stamp}`,
    formattedAddress:
      "Unit 4B, 123 Maharlika Street, Greenview Subdivision, Barangay San Antonio, Pasig City, 1605 Metro Manila, Philippines",
    roadAddress: "123 Maharlika Street, Pasig City",
    detailAddress: `Unit 4B QA${stamp}`,
    deliveryNote: null,
    fullAddress: null,
    neighborhoodName: null,
    appRegionId: null,
    appCityId: null,
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: true,
    isDefaultLife: false,
    isDefaultTrade: false,
    isDefaultDelivery: false,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
  } as UserAddressDTO);

  const payload: UserAddressWritePayload = {
    labelType: "other",
    nickname: `QA Pasig ${stamp}`,
    countryCode: "PH",
    countryName: "Philippines",
    province: "Metro Manila",
    cityMunicipality: "Pasig City",
    barangay: "San Antonio",
    streetAddress: "123 Maharlika Street",
    buildingName: "Greenview Subdivision",
    unitFloorRoom: `Unit 4B QA${stamp}`,
    detailAddress: `Unit 4B QA${stamp}`,
    latitude: 14.5764,
    longitude: 121.0851,
    placeId: `ChIJ_QA_PASIG_${stamp}`,
    formattedAddress:
      "Unit 4B, 123 Maharlika Street, Greenview Subdivision, Barangay San Antonio, Pasig City, 1605 Metro Manila, Philippines",
    roadAddress: "123 Maharlika Street, Pasig City",
    appRegionId: hit?.regionId ?? "manila",
    appCityId: hit?.cityId ?? "m20",
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: true,
    isDefaultDelivery: false,
  };

  let db: UserAddressDTO | null = null;
  let path = "createUserAddress(sb)";
  try {
    db = await createUserAddress(sb, userId, payload);
  } catch (e: any) {
    const http = await apiJson(cookieHeader, "POST", "/api/me/addresses", payload);
    if (http.status >= 300 || !http.json?.ok) {
      return {
        status: "FAIL",
        error: `create failed: ${String(e?.message || e)} / HTTP ${http.status}`,
        detail: { body: http.text.slice(0, 400), mapperHit: hit },
      };
    }
    db = http.json.address as UserAddressDTO;
    path = "POST /api/me/addresses";
  }

  const rows = await listUserAddresses(sb, userId);
  const row = rows.find((r) => r.id === db!.id) ?? db!;
  const ok =
    Boolean(row.appRegionId) &&
    Boolean(row.appCityId) &&
    (row.cityMunicipality || "").includes("Pasig") &&
    (row.unitFloorRoom || row.detailAddress || "").includes("Unit 4B") &&
    (row.streetAddress || "").includes("Maharlika") &&
    (row.barangay || "").toLowerCase().includes("san antonio");

  return {
    status: pf(ok),
    detail: {
      path,
      googleUi: "NOT_AUTO_DRIVEN",
      id: row.id,
      appRegionId: row.appRegionId,
      appCityId: row.appCityId,
      cityMunicipality: row.cityMunicipality,
      province: row.province,
      mapperHit: hit,
    },
  };
}

async function gateAddressBook(row: UserAddressDTO | null): Promise<Gate> {
  if (!row) return { status: "HOLD", error: "no address row" };
  const book = formatAddressBookLine(row);
  const seg = formatAddressBookLineSegments(row);
  const ok =
    Boolean(book) &&
    !countryLeak(book) &&
    Boolean(seg?.detail) &&
    !/\n/.test(book || "") &&
    (book || "").startsWith(seg!.detail!);
  // wrap evidence reused from prior PASS + CSS contract
  const wrapEvidence = fs
    .readdirSync(path.join(ROOT, ".qa-logs"))
    .filter((d) => d.startsWith("address-compact-wrap-"))
    .sort()
    .at(-1);
  return {
    status: pf(ok),
    detail: {
      book,
      detail: seg?.detail,
      rest: seg?.rest,
      countryExcluded: !countryLeak(book),
      compactWrapEvidence: wrapEvidence ?? null,
      note: "natural wrap CSS contract + prior narrow/wide PASS",
    },
  };
}

function asAddressDto(raw: any): UserAddressDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  return {
    ...(raw as UserAddressDTO),
    id,
    cityMunicipality: raw.cityMunicipality ?? raw.city_municipality ?? null,
    province: raw.province ?? null,
    barangay: raw.barangay ?? null,
    streetAddress: raw.streetAddress ?? raw.street_address ?? null,
    buildingName: raw.buildingName ?? raw.building_name ?? null,
    unitFloorRoom: raw.unitFloorRoom ?? raw.unit_floor_room ?? null,
    detailAddress: raw.detailAddress ?? raw.detail_address ?? null,
    appRegionId: raw.appRegionId ?? raw.app_region_id ?? null,
    appCityId: raw.appCityId ?? raw.app_city_id ?? null,
    countryCode: raw.countryCode ?? raw.country_code ?? "PH",
    countryName: raw.countryName ?? raw.country_name ?? "Philippines",
  } as UserAddressDTO;
}

async function gateCommunity(sb: SupabaseClient, userId: string, row: UserAddressDTO | null): Promise<Gate> {
  const expectedTitle = resolveUserAddressTitle(row);
  const label = await resolveCommunityPublicRegionLabelForUser(sb, userId);
  return {
    status: pf(Boolean(expectedTitle) && label === expectedTitle),
    detail: {
      expectedTitle,
      communityResolverLabel: label,
      note: "Community current user address label = master TITLE",
    },
  };
}

async function gateTrade(cookieHeader: string, row: UserAddressDTO | null): Promise<Gate> {
  const defaults = await apiJson(cookieHeader, "GET", "/api/me/address-defaults");
  const master = asAddressDto(defaults.json?.defaults?.master || defaults.json?.master || null);
  const source = master || row;
  const title = resolveUserAddressTitle(source);
  const mapped = source ? mapUserAddressToAppLocation(source) : null;
  const mappedQa = row ? mapUserAddressToAppLocation(row) : null;
  const regionId = source?.appRegionId || mapped?.regionId || mappedQa?.regionId || null;
  const cityId = source?.appCityId || mapped?.cityId || mappedQa?.cityId || null;
  const regionErrorRisk = !regionId || !cityId;
  return {
    status: pf(Boolean(title) && !regionErrorRisk),
    detail: {
      title,
      appRegionId: regionId,
      appCityId: cityId,
      regionErrorRisk,
      legacyTradeDefaultReturned: Boolean(defaults.json?.defaults?.trade),
      legacyLifeDefaultReturned: Boolean(defaults.json?.defaults?.life),
      legacyDeliveryDefaultReturned: Boolean(defaults.json?.defaults?.delivery),
      defaultsHttp: defaults.status,
    },
  };
}

function gateTradeMeetSpot(): Gate {
  const policy = fs.readFileSync(path.join(ROOT, "lib/trade/trade-lifecycle-policy.ts"), "utf8");
  const ownerTrade = fs.readFileSync(
    path.join(ROOT, "app/api/posts/[postId]/owner-trade-update/route.ts"),
    "utf8",
  );
  const ownerEdit = fs.readFileSync(path.join(ROOT, "app/api/posts/[postId]/owner-edit/route.ts"), "utf8");
  const draftOk = allowEditTradeLocationSnapshot("draft");
  const activeBlocked = !allowEditTradeLocationSnapshot("active");
  const freezes =
    ownerTrade.includes("allowEditTradeLocationSnapshot") &&
    ownerEdit.includes("allowEditTradeLocationSnapshot");
  const meetSeparate =
    ownerTrade.includes("trade_meet_spot") ||
    policy.includes("trade_meet") ||
    fs
      .readFileSync(path.join(ROOT, "components/write/trade/TradeMeetSpotPickClient.tsx"), "utf8")
      .includes("TradeMeetSpot");
  return {
    status: pf(draftOk && activeBlocked && freezes && meetSeparate),
    detail: {
      draftEditable: draftOk,
      activeImmutable: activeBlocked,
      ownerMentionsFreeze: freezes,
      meetSpotSeparate: meetSeparate,
      note: "UI meet pick not auto-driven — immutability + separate surface contract verified",
    },
  };
}

async function gateDelivery(row: UserAddressDTO | null, cookieHeader: string): Promise<Gate> {
  const del = row ? formatDeliveryAddress(row) : "";
  const defaults = await apiJson(cookieHeader, "GET", "/api/me/address-defaults");
  const master = defaults.json?.defaults?.master || null;
  return {
    status: pf(Boolean(row?.id) && Boolean(del) && del.split("\n").length >= 4 && master?.id === row?.id),
    detail: {
      deliveryLines: del.split("\n"),
      masterId: master?.id ?? null,
      rowId: row?.id ?? null,
      legacyDeliveryDefaultId: defaults.json?.defaults?.delivery?.id ?? null,
      bookCountryExcluded: row ? !countryLeak(formatAddressBookLine(row)) : null,
      fullDetailVisible: del.split("\n").length >= 4,
      defaultsHttp: defaults.status,
    },
  };
}

async function gateCheckout(
  admin: SupabaseClient | null,
  cookieHeader: string,
  userId: string,
  addressId: string | null,
): Promise<Gate> {
  if (!admin) return { status: "HOLD", error: "no service role" };
  const { data: orders, error } = await admin
    .from("store_orders")
    .select("id,delivery_formatted_address,delivery_detail_address,buyer_user_id,created_at")
    .eq("buyer_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return { status: "HOLD", error: error.message };
  if (!orders?.length) {
    return {
      status: "HOLD",
      detail: { reason: "NO_EXISTING_ORDER_FOR_USER — skip create to avoid side effects" },
    };
  }
  const order = orders[0];
  const before = {
    formatted: order.delivery_formatted_address,
    detail: order.delivery_detail_address,
  };
  if (addressId) {
    await apiJson(cookieHeader, "PATCH", `/api/me/addresses/${addressId}`, {
      nickname: `QA-touch-${Date.now()}`,
    });
  }
  const { data: afterRow } = await admin
    .from("store_orders")
    .select("id,delivery_formatted_address,delivery_detail_address")
    .eq("id", order.id)
    .maybeSingle();
  const immutable =
    (afterRow?.delivery_formatted_address ?? null) === (before.formatted ?? null) &&
    (afterRow?.delivery_detail_address ?? null) === (before.detail ?? null);
  return {
    status: pf(immutable),
    detail: {
      orderId: order.id,
      before,
      after: {
        formatted: afterRow?.delivery_formatted_address,
        detail: afterRow?.delivery_detail_address,
      },
      immutable,
    },
  };
}

function gatePickerMatrix(): Gate {
  const missing = (rel: string) => !fs.existsSync(path.join(ROOT, rel));
  const trade = fs.readFileSync(path.join(ROOT, "components/write/shared/TradeDefaultLocationBlock.tsx"), "utf8");
  const philife = fs.readFileSync(path.join(ROOT, "components/philife/PhilifeHeaderAddressMenuButton.tsx"), "utf8");
  const deliveryOk = missing("components/addresses/DeliveryStyleAddressPickerSheet.tsx");
  const listOk = missing("components/addresses/AddressBookPickerList.tsx");
  const editorOk = missing("components/addresses/AddressEditorSheet.tsx");
  const fineTuneOk = missing("components/addresses/AddressFineTuneSheet.tsx");
  const tradeOk = trade.includes("formatUserAddressTitle") && !trade.includes("AddressBookPickerList");
  const philifeOk = philife.includes("router.push(href)") && !philife.includes("fetchMeAddressesListSingleFlight");
  return {
    status: pf(deliveryOk && listOk && editorOk && fineTuneOk && tradeOk && philifeOk),
    detail: { deliveryOk, listOk, editorOk, fineTuneOk, tradeOk, philifeOk },
  };
}

async function gateGoogleUi(cookies: Array<Record<string, unknown>>): Promise<Gate> {
  let browser: Browser | null = null;
  try {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    browser = await chromium.launch({
      headless: true,
      executablePath: fs.existsSync(chrome) ? chrome : undefined,
    });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies(cookies as any);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/mypage/addresses`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(4000);
    const body = ((await page.locator("body").innerText()) || "").replace(/\s+/g, " ");
    fs.writeFileSync(path.join(OUT, "ui-mypage-addresses.txt"), body.slice(0, 8000));
    await page.screenshot({ path: path.join(OUT, "ui-mypage-addresses.png"), fullPage: true });

    // try open add/edit
    const addBtn = page.getByRole("button", { name: /추가|Add|새 주소|주소 추가/i }).first();
    let googleUi: "PASS" | "HOLD" | "FAIL" = "HOLD";
    let googleDetail = "add button not found or page loading";
    if (await addBtn.count()) {
      await addBtn.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(2000);
      const t = ((await page.locator("body").innerText()) || "").replace(/\s+/g, " ");
      fs.writeFileSync(path.join(OUT, "ui-address-editor.txt"), t.slice(0, 8000));
      await page.screenshot({ path: path.join(OUT, "ui-address-editor.png"), fullPage: true });
      if (/gm-err|Google Maps|Maps JavaScript API|Autocomplete/i.test(t) && /error|err/i.test(t)) {
        googleUi = "HOLD";
        googleDetail = "Google Maps UI error on local origin (known gm-err risk)";
      } else if (/검색|Search|세부|detail|Fine|위치/i.test(t)) {
        googleUi = "HOLD";
        googleDetail = "editor UI visible; full Google place+finetune+save not auto-driven";
      }
    } else if (/Loading/i.test(body) && body.length < 80) {
      googleUi = "HOLD";
      googleDetail = "mypage/addresses stuck Loading (cookie hydration)";
    }

    const bookVisible =
      /Unit|Pasay|Quezon|Manila|Pasig|Maharlika|Roxas|Street|Barangay/i.test(body) &&
      !countryLeak(body) &&
      !/Loading…/.test(body);
    return {
      status: bookVisible ? "PASS" : "HOLD",
      detail: { bookVisible, googleUi, googleDetail, bodyPreview: body.slice(0, 240) },
    };
  } catch (e: any) {
    return { status: "HOLD", error: String(e?.message || e) };
  } finally {
    await browser?.close();
  }
}

async function main() {
  const report: Record<string, any> = {
    origin: ORIGIN,
    login: LOGIN,
    out: OUT,
    gates: {} as Record<string, Gate>,
    hardLock: "HOLD",
    final: "HOLD",
  };
  log(`OUT=${OUT}`);
  log(`ORIGIN=${ORIGIN}`);

  const auth = await loginMember();
  const userId = auth.session.user.id;
  report.userId = userId;

  const cookieHeader = cookieHeaderFromList(auth.cookies);

  // 1 Address Add (writer path = editor save contract; Google UI separate HOLD/PASS)
  report.gates.addressAdd = await gateAddressAdd(auth.sb, cookieHeader, userId);
  const rows = await listUserAddresses(auth.sb, userId);
  const qaRow =
    rows.find((r) => (r.nickname || "").includes("QA Pasig") || (r.unitFloorRoom || "").includes("Unit 4B QA")) ||
    rows.find((r) => (r.cityMunicipality || "").includes("Pasig")) ||
    rows.find((r) => (r.cityMunicipality || "").includes("Pasay")) ||
    rows[0] ||
    null;
  fs.writeFileSync(path.join(OUT, "qa-row.json"), JSON.stringify(qaRow, null, 2));

  // 2 Address Book
  report.gates.addressBook = await gateAddressBook(qaRow);

  // UI / Google attempt
  report.gates.addressBookUiGoogle = await gateGoogleUi(auth.cookies);

  // 3 Community
  report.gates.community = await gateCommunity(auth.sb, userId, qaRow);

  // 4 Trade
  report.gates.trade = await gateTrade(cookieHeader, qaRow);

  // 5 Trade Meeting Spot
  report.gates.tradeMeetSpot = gateTradeMeetSpot();

  // 6 Delivery
  report.gates.delivery = await gateDelivery(qaRow, cookieHeader);

  // 7 Checkout snapshot
  report.gates.checkout = await gateCheckout(auth.admin, cookieHeader, userId, qaRow?.id ?? null);

  // 8 Picker matrix
  report.gates.picker = gatePickerMatrix();

  // PUBLIC / DELIVERY summary
  if (qaRow) {
    const title = resolveUserAddressTitle(qaRow);
    report.public = {
      value: formatPublicAddress(qaRow),
      leak: publicLeak(formatPublicAddress(qaRow)),
      note: "legacy public formatter retained for non-current public taxonomy, not current USER address authority",
    };
    report.title = {
      value: title,
      leaksDetail: publicRegionLabelLeaksPrivateDetail(title ?? ""),
    };
    report.delivery = {
      lines: formatDeliveryAddress(qaRow).split("\n"),
    };
    report.book = {
      plain: formatAddressBookLine(qaRow),
      segments: formatAddressBookLineSegments(qaRow),
    };
  }

  const required = [
    "addressAdd",
    "addressBook",
    "community",
    "trade",
    "tradeMeetSpot",
    "delivery",
    "checkout",
    "picker",
  ] as const;
  const statuses = required.map((k) => report.gates[k]?.status);
  const allPass = statuses.every((s) => s === "PASS");
  const anyFail = statuses.some((s) => s === "FAIL");
  report.hardLock = allPass ? "DECLARED" : "HOLD";
  report.final = allPass ? "CLOSED" : anyFail ? "HOLD_WITH_FAIL" : "HOLD";
  report.gateStatuses = Object.fromEntries(required.map((k) => [k, report.gates[k]?.status]));

  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(JSON.stringify(report, null, 2));
  process.exit(allPass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(OUT, "FATAL.json"), JSON.stringify({ error: String(e?.stack || e) }, null, 2));
  process.exit(1);
});
