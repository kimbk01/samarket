#!/usr/bin/env node
/**
 * DIBAY 로딩 스피너 단일 정의 검사 — `docs/audit/loading-spinner-network-notice-design-2026-11-22.md` §3-1.
 *
 * 사용자 화면(app/·components/·lib/)에서:
 *  1. `animate-spin`·Lucide `Loader2` 회전 금지 → `components/ui/DibaySpinner.tsx` 를 쓴다.
 *  2. 스피너 keyframes 새로 만들기 금지 (`sam-spinner-*` 만).
 *  3. 「불러오는 중…」 글자만 있는 대기 금지(`>{t("common_loading")}<`) → `DibayPendingSpinner` · 버튼 안 `DibaySpinner`.
 *  4. `loading.tsx` 의 `return null` 금지 → `MainSegmentPendingLoading`(허브 첫 화면·통화 화면은 그 안에서 비움).
 *
 * 아직 바꾸지 않은 곳은 기준선(파일별 현재 개수)으로만 묶는다 — 늘면 실패.
 *  - 통화 화면: P4(Owner 「C1·C2만 승인」 2026-11-22)로 발신 화면·다시 걸기 버튼은 바꿨다 — 통화 기준선 0.
 *    통화 구간 loading 의 null 3개는 의도된 빈 화면(네이티브·통화 호스트가 맡음, 영향 분석 §3)이라 그대로 기준선.
 *  - 관리자 화면: 이번 범위 밖
 *  - 스피너 + 글자가 함께 있는 상태 표시(글자만이 아님)
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib"];

const BASELINE = {
  "animate-spin": {
    "components/admin/settings/AdminNotificationSoundSsotTable.tsx": 1,
  },
  Loader2: {
    "components/admin/settings/AdminNotificationSoundSsotTable.tsx": 2,
  },
  "text-only-loading": {
    // 스피너 옆 상태 글자(글자만 대기가 아님)
    "components/business/admin/dashboard/BusinessAdminDashboard.tsx": 1,
    "components/community-messenger/contacts/MessengerContactsStatus.tsx": 1,
  },
  "loading-return-null": {
    "app/(main)/community-messenger/calls/loading.tsx": 1,
    "app/(main)/community-messenger/calls-v3/loading.tsx": 1,
    "app/(main)/community-messenger/calls/[sessionId]/loading.tsx": 1,
  },
};

const RULES = [
  { id: "animate-spin", ext: /\.(tsx?|jsx?)$/, re: /animate-spin/g },
  { id: "Loader2", ext: /\.(tsx?|jsx?)$/, re: /\bLoader2\b/g },
  { id: "spinner-keyframes", ext: /\.css$/, re: /@keyframes\s+(?!sam-spinner-)[\w-]*(spin|buffer)[\w-]*/gi },
  {
    id: "text-only-loading",
    ext: /\.tsx$/,
    // 관리자 화면은 이번 범위 밖(설계 §3-1) — 글자 대기 규칙만 제외, 회전 규칙은 기준선으로 묶음
    skip: (rel) => /^(app\/admin|components\/admin)\//.test(rel) || /^components\/finance\/AdminFinance/.test(rel),
    re: />\s*\{(?:vm\.)?t\("(?:common_loading|mypage_comp_loading_ellipsis)"\)\}\s*</g,
  },
  { id: "loading-return-null", ext: /(^|\/)loading\.tsx$/, re: /return null;/g },
];

function isTestFile(rel) {
  return /(^|\/)__tests__\//.test(rel) || /\.test\.(tsx?|jsx?)$/.test(rel);
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

const files = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);

const failures = [];
for (const full of files) {
  const rel = path.relative(ROOT, full).split(path.sep).join("/");
  if (isTestFile(rel)) continue;
  let src = null;
  for (const rule of RULES) {
    if (!rule.ext.test(rel)) continue;
    if (rule.skip && rule.skip(rel)) continue;
    if (src === null) src = fs.readFileSync(full, "utf8");
    // 주석 안 설명 문구는 세지 않는다(이 규칙을 설명하는 주석 등)
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const count = (code.match(rule.re) || []).length;
    if (count === 0) continue;
    const allowed = (BASELINE[rule.id] || {})[rel] || 0;
    if (count > allowed) failures.push(`${rule.id}: ${rel} (${count} > 기준선 ${allowed})`);
  }
}

for (const [ruleId, byFile] of Object.entries(BASELINE)) {
  for (const rel of Object.keys(byFile)) {
    if (!fs.existsSync(path.join(ROOT, rel))) failures.push(`${ruleId}: 기준선 파일 없음 — 목록에서 지운다: ${rel}`);
  }
}

if (failures.length) {
  console.error("verify:loading-spinner-ssot FAIL — DIBAY 스피너는 components/ui/DibaySpinner.tsx 만 쓴다");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify:loading-spinner-ssot: ok");
