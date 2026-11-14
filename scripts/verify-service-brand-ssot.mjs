/**
 * 서비스 브랜드 SSOT 검사 (설계 docs/design/service-brand-icon-state-ssot-design-2026-11-13.md F-1 · 재감사 R4).
 * Usage: node scripts/verify-service-brand-ssot.mjs
 *
 * 1) 브랜드 이름 8개가 상수(`lib/brand/dibay-service-brand.ts`)와 같다 (메시지 서비스 표시값 = telRING, 2026-11-14).
 * 2) 브랜드 아이콘 경로 데이터는 상수 파일 한 곳에만 있고, 그리는 곳은 `components/brand/ServiceBrandIcon.tsx` 하나다.
 * 3) 하단 탭 5개 이름 키(ko·en)가 브랜드 상수 값과 같다.
 * 4) 옛 서비스 이름(SAMessenger·사마켓 메신저·DIBAY MARKET·필라이프·Philife)이 카탈로그 값에 없다.
 *    예외 = 아직 Owner 결정 전인 「쓰이지 않는 키」(설계 N3·N5·N6) — 화면 코드에서 쓰기 시작하면 실패한다.
 * 네이티브(Android strings.xml·시작 화면 HTML)는 N 단계(별도 승인) 대상이라 여기서 검사하지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (fs.existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => {
  const code = typeof rest[0] === "object" ? rest[0]?.code : rest[1];
  if (code === "MODULE_TYPELESS_PACKAGE_JSON") return;
  emitWarning(warning, ...rest);
};

const errors = [];
const fail = (msg) => errors.push(msg);

const BRAND_FILE = "lib/brand/dibay-service-brand.ts";
const ICON_RENDERER = "components/brand/ServiceBrandIcon.tsx";
const brandMod = await import(pathToFileURL(path.join(ROOT, BRAND_FILE)).href);
const B = brandMod.DIBAY_SERVICE_BRAND;

// 1) 이름 8개
const EXPECTED = ["HOME", "LOUNGE", "FEED", "MARKET", "CREW", "DIPICK", "LETARING", "MY"];
/** 표시값 — 키와 같되 메시지 서비스(LETARING 키)는 telRING (Owner 2026-11-14 「TEL-RING 을 telRING 으로」) */
const EXPECTED_VALUE = { LETARING: "telRING" };
for (const id of EXPECTED) {
  const want = EXPECTED_VALUE[id] ?? id;
  if (B?.[id] !== want) fail(`브랜드 이름 ${id} 값이 다름: ${JSON.stringify(B?.[id])} (기대 ${want})`);
}
if (Object.keys(B ?? {}).length !== EXPECTED.length) fail(`브랜드 이름 개수 ${Object.keys(B ?? {}).length} (기대 ${EXPECTED.length})`);

// 화면 코드 파일 목록 (테스트·카탈로그 제외)
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "__tests__" || ent.name.startsWith(".")) continue;
      walk(rel, out);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name) && !/\.(test|spec)\.[jt]sx?$/.test(ent.name)) {
      out.push(rel);
    }
  }
  return out;
}
const codeFiles = ["app", "components", "lib", "hooks"].filter((d) => fs.existsSync(path.join(ROOT, d))).flatMap((d) => walk(d));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// 2) 아이콘 경로 데이터는 한 곳, 그리는 곳은 한 곳
const iconPaths = Object.values(brandMod.DIBAY_SERVICE_BRAND_ICON_PATH ?? {});
if (iconPaths.length !== EXPECTED.length) fail(`브랜드 아이콘 경로 개수 ${iconPaths.length} (기대 ${EXPECTED.length})`);
for (const rel of codeFiles) {
  if (rel === BRAND_FILE) continue;
  const src = read(rel);
  for (const d of iconPaths) if (d && src.includes(d.slice(0, 40))) fail(`${rel}: 브랜드 아이콘 경로를 복사함 — ${ICON_RENDERER} 를 쓴다`);
  if (rel !== ICON_RENDERER && /\bDIBAY_SERVICE_BRAND_ICON_PATH\b/.test(src)) fail(`${rel}: 아이콘 경로 상수를 직접 그림 — ${ICON_RENDERER} 를 쓴다`);
}

// 카탈로그 실행
const catalogDir = path.join(ROOT, "lib/i18n/catalog");
const merged = { ko: new Map(), en: new Map() };
for (const file of fs.readdirSync(catalogDir).filter((f) => f.endsWith(".ts")).sort()) {
  const mod = await import(pathToFileURL(path.join(catalogDir, file)).href);
  for (const exported of Object.values(mod)) {
    if (!exported || typeof exported !== "object" || !exported.ko || !exported.en) continue;
    for (const lang of ["ko", "en"]) for (const [k, v] of Object.entries(exported[lang])) merged[lang].set(k, String(v));
  }
}

// 3) 하단 탭 이름
const NAV_KEYS = { "nav.home": "HOME", "nav.community": "LOUNGE", "nav.delivery": "DIPICK", "nav.chat": "LETARING", "nav.my": "MY" };
for (const [key, id] of Object.entries(NAV_KEYS)) {
  for (const lang of ["ko", "en"]) {
    if (merged[lang].get(key) !== B[id]) fail(`하단 탭 ${key} (${lang}) = ${JSON.stringify(merged[lang].get(key))} — 기대 ${B[id]}`);
  }
}

// 4) 옛 서비스 이름
const LEGACY = /SAMessenger|사마켓 메신저|DIBAY MARKET|필라이프|Philife/;
/** Owner 결정 전 · 화면 코드에서 쓰지 않는 키 (설계 N3 광고 상품명 · N5 옛 앱 이름 · N6 사용처 0 중복 키) */
const PENDING_UNUSED = new Set([
  "marketplace_home_title",
  "marketplace_search_placeholder",
  "nav_messenger_open_store_order",
  "nav_messenger_open_store_order_short",
  "nav_store_order_messenger_section_title",
  "philife_write_ad_product_mid_insert_title",
  "philife_write_ad_product_highlight_title",
  "admin_posts_help_trade_after_code",
]);
const codeText = codeFiles.filter((rel) => !rel.startsWith("lib/i18n/catalog/")).map(read).join("\n");
for (const lang of ["ko", "en"]) {
  for (const [key, value] of merged[lang]) {
    if (!LEGACY.test(value)) continue;
    if (PENDING_UNUSED.has(key)) continue;
    fail(`옛 서비스 이름: ${key} (${lang}) = ${value.slice(0, 60)}`);
  }
}
for (const key of PENDING_UNUSED) {
  if (codeText.includes(`"${key}"`) || codeText.includes(`'${key}'`) || codeText.includes(`\`${key}\``)) {
    fail(`보류 키 ${key} 를 화면 코드가 쓰기 시작함 — 옛 서비스 이름을 먼저 정리한다`);
  }
}

if (errors.length) {
  console.error(`[verify:service-brand-ssot] FAIL (${errors.length})`);
  for (const e of errors.slice(0, 50)) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `[verify:service-brand-ssot] PASS — 이름 ${EXPECTED.length} · 아이콘 경로 ${iconPaths.length} · 코드 파일 ${codeFiles.length} · 하단 탭 키 ${Object.keys(NAV_KEYS).length} · 보류 키 ${PENDING_UNUSED.size}`
);
