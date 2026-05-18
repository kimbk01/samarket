/**
 * Phase 11: Migrate admin misc folders to i18n (semantic admin_* keys).
 * Excludes dev-sprints, operations (already migrated).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();

const TARGET_DIRS = [
  "qa-board",
  "launch-week",
  "launch-readiness",
  "reviews",
  "security",
  "member-benefits",
  "production-migration",
  "ops-benchmarks",
  "recommendation-deployments",
  "feed-emergency",
  "recommendation",
  "performance",
  "personalized-feed",
  "exposure",
  "my",
  "home-feed",
  "dr",
];

const PREFIX = {
  "qa-board": "admin_qa",
  "launch-week": "admin_launch_week",
  "launch-readiness": "admin_launch_readiness",
  "reviews": "admin_review",
  "security": "admin_security",
  "member-benefits": "admin_member_benefit",
  "production-migration": "admin_prod_migration",
  "ops-benchmarks": "admin_ops_benchmark",
  "recommendation-deployments": "admin_rec_deploy",
  "feed-emergency": "admin_feed_emergency",
  recommendation: "admin_rec_analytics",
  performance: "admin_performance",
  "personalized-feed": "admin_personalized_feed",
  exposure: "admin_exposure",
  my: "admin_my",
  "home-feed": "admin_home_feed",
  dr: "admin_dr",
};

const COMMON = {
  전체: "common_all",
  저장: "common_save",
  취소: "common_cancel",
  수정: "common_edit",
  삭제: "common_delete",
  검색: "common_search",
  "불러오는 중": "common_loading",
  "불러오는 중…": "common_loading",
  "불러오는 중...": "common_loading",
  "처리 중...": "common_processing",
  닫기: "common_close",
  확인: "common_confirm",
  편집: "common_edit",
  추가: "common_add",
  선택: "common_select",
};

const EN_GLOSS = {
  전체: "All",
  상태: "Status",
  제목: "Title",
  설명: "Description",
  담당: "Owner",
  영역: "Area",
  분류: "Category",
  환경: "Environment",
  우선순위: "Priority",
  심각도: "Severity",
  비고: "Notes",
  연결: "Link",
  활성: "Active",
  비활성: "Inactive",
  저장: "Save",
  취소: "Cancel",
  편집: "Edit",
  추가: "Add",
  검색: "Search",
  확인: "Confirm",
  닫기: "Close",
  선택: "Select",
  없습니다: "empty",
  미실행: "Not started",
  진행중: "In progress",
  통과: "Passed",
  실패: "Failed",
  차단: "Blocked",
  오픈: "Open",
  수정됨: "Fixed",
  검증됨: "Verified",
  미해결: "Won't fix",
  긴급: "Critical",
  높음: "High",
  중간: "Medium",
  낮음: "Low",
  할: "Todo",
  완료: "Done",
  홈: "Home",
  검색: "Search",
  상점: "Shop",
  채팅: "Chat",
  포인트: "Points",
  신고: "Report",
  온보딩: "Onboarding",
  등록: "Posting",
  관리자: "Admin",
  요약: "Summary",
  개요: "Overview",
  체크리스트: "Checklist",
  이슈: "Issues",
  승인: "Approved",
  반려: "Rejected",
  조건부: "Conditional",
  표시: "Visible",
  숨김: "Hidden",
  신고됨: "Reported",
  좋아요: "Good",
  보통: "Normal",
  별로: "Bad",
  생성: "Create",
  배포: "Deploy",
  롤백: "Rollback",
  예약: "Scheduled",
  성공: "Success",
  안전: "Safe",
  주의: "Warning",
  위험: "Critical",
  미해결: "Open",
  해결됨: "Resolved",
  정상: "Normal",
  양호: "Healthy",
};

const koRe = /[\uAC00-\uD7A3][\uAC00-\uD7A3a-zA-Z0-9_·/().,%:+\-—\s{}'"`]{0,240}/g;

/** @type {Map<string, { key: string, prefix: string }>} */
const stringToKey = new Map();
/** @type {Record<string, string>} */
const ko = {};
/** @type {Record<string, string>} */
const en = {};
/** @type {Record<string, string>} */
const zh = {};

const usedKeys = new Set(Object.values(COMMON));

function enSlug(text) {
  const parts = [];
  for (const [koWord, enWord] of Object.entries(EN_GLOSS)) {
    if (text.includes(koWord)) parts.push(enWord);
  }
  let slug = parts
    .join(" ")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
  if (!slug || slug.length < 2) {
    slug =
      "k" +
      crypto
        .createHash("sha1")
        .update(text)
        .digest("hex")
        .slice(0, 8);
  }
  return slug.slice(0, 48);
}

function assignKey(folder, raw) {
  const s = raw.trim();
  if (!s || s.length < 2) return null;
  if (s.includes("마닐라") && !s.includes("Malate")) return null; // locale data, not UI copy
  if (COMMON[s]) return COMMON[s];

  const existing = stringToKey.get(s);
  if (existing) return existing.key;

  const prefix = PREFIX[folder] ?? "admin_misc";
  let base = enSlug(s);
  let key = `${prefix}_${base}`;
  let n = 2;
  while (usedKeys.has(key)) {
    key = `${prefix}_${base}_${n}`;
    n++;
  }
  usedKeys.add(key);

  const enText = Object.entries(EN_GLOSS).reduce(
    (acc, [k, v]) => acc.replaceAll(k, v),
    s
  );
  stringToKey.set(s, { key, prefix });
  ko[key] = s;
  en[key] = enText !== s ? enText : s;
  zh[key] = s; // zh-CN placeholder; refine later
  return key;
}

function walkDir(folder, cb) {
  const root = path.join(ROOT, "components/admin", folder);
  if (!fs.existsSync(root)) return;
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(e.name)) cb(p, folder);
    }
  }
  walk(root);
}

// Collect strings per folder
for (const folder of TARGET_DIRS) {
  walkDir(folder, (filePath, folder) => {
    const text = fs.readFileSync(filePath, "utf8");
    let m;
    while ((m = koRe.exec(text)) !== null) {
      assignKey(folder, m[0]);
    }
  });
}

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

const lines = (obj) =>
  Object.entries(obj)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `    ${k}: "${esc(v)}",`)
    .join("\n");

const catalog = `/** Phase 11: admin misc domains (qa, launch, reviews, security, …) */
export const adminMiscMessages = {
  ko: {
${lines(ko)}
  },
  en: {
${lines(en)}
  },
  "zh-CN": {
${lines(zh)}
  },
};
`;

fs.writeFileSync(path.join(ROOT, "lib/i18n/catalog/admin-misc.ts"), catalog);

function patchContent(content, filePath) {
  if (!/[\uAC00-\uD7A3]/.test(content)) return content;
  let next = content;
  const folder = TARGET_DIRS.find((d) => filePath.replace(/\\/g, "/").includes(`/admin/${d}/`));
  if (!folder) return content;

  const getKey = (s) => {
    const k = assignKey(folder, s.trim());
    return k ?? null;
  };

  // AdminPageHeader / AdminCard title
  next = next.replace(/<AdminPageHeader\s+title="([^"]+)"/g, (_, t) => {
    const k = getKey(t);
    return k ? `<AdminPageHeader titleKey="${k}"` : `<AdminPageHeader title="${t}"`;
  });
  next = next.replace(/<AdminPageHeader\s+title="([^"]+)"\s+description="([^"]+)"/g, (_, t, d) => {
    const kt = getKey(t);
    const kd = getKey(d);
    if (kt && kd) return `<AdminPageHeader titleKey="${kt}" descriptionKey="${kd}"`;
    return `<AdminPageHeader title="${t}" description="${d}"`;
  });
  next = next.replace(/<AdminCard\s+title="([^"]+)"/g, (_, t) => {
    const k = getKey(t);
    return k ? `<AdminCard titleKey="${k}"` : `<AdminCard title="${t}"`;
  });

  // Sort by length desc for replacements
  const entries = [...stringToKey.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [s, { key }] of entries) {
    if (!s.match(/[\uAC00-\uD7A3]/)) continue;
    if (s.includes("{") && s.includes("}")) continue;
    if (s.includes("<") || s.includes(">")) continue;
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`>${escaped}<`, "g"), `>{t("${key}")}<`);
    next = next.replace(new RegExp(`title="${escaped}"`, "g"), `titleKey="${key}"`);
    next = next.replace(new RegExp(`description="${escaped}"`, "g"), `descriptionKey="${key}"`);
    next = next.replace(new RegExp(`placeholder="${escaped}"`, "g"), `placeholder={t("${key}")}`);
    next = next.replace(new RegExp(`aria-label="${escaped}"`, "g"), `aria-label={t("${key}")}`);
    next = next.replace(new RegExp(`label: "${escaped}"`, "g"), `labelKey: "${key}" as const`);
    next = next.replace(
      new RegExp(`<option value="([^"]*)">${escaped}</option>`, "g"),
      `<option value="$1">{t("${key}")}</option>`
    );
  }

  const isClient = /["']use client["']/.test(next);
  const needsT = next.includes('{t("') || next.includes("titleKey=") || next.includes("labelKey:");
  if (needsT && isClient && !next.includes("useI18n")) {
    if (!next.includes("AppLanguageProvider")) {
      next = next.replace(
        /(["']use client["'];?\s*\n)/,
        `$1\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\nimport type { MessageKey } from "@/lib/i18n/messages";\n`
      );
    }
    if (!next.includes("const { t }")) {
      next = next.replace(
        /export function (\w+)\([^)]*\)\s*\{/,
        (m) => `${m}\n  const { t } = useI18n();`
      );
    }
  }

  // motion.div -> div
  next = next.replace(/motion\.motion\.div/g, "motion.div");
  next = next.replace(/<motion\.div/g, "<motion.div".replace("motion.", "") || "<div");
  next = next.replace(/<motion\.motion\.div/g, "<motion.div");
  next = next.replace(/<motion\.div/g, "<div");
  next = next.replace(/<\/motion\.motion\.motion\.motion\.div>/g, "</div>");
  next = next.replace(/<\/motion\.motion\.motion\.div>/g, "</div>");
  next = next.replace(/<\/motion\.motion\.motion\.div>/g, "</div>");
  next = next.replace(/<\/motion\.motion\.motion\.div>/g, "</motion.div>");
  next = next.replace(/<\/motion\.div>/g, "</div>");

  return next;
}

let changed = 0;
for (const folder of TARGET_DIRS) {
  walkDir(folder, (filePath) => {
    const rel = filePath;
    const before = fs.readFileSync(filePath, "utf8");
    const after = patchContent(before, rel);
    if (after !== before) {
      fs.writeFileSync(filePath, after);
      changed++;
    }
  });
}

// Merge admin.ts
const adminPath = path.join(ROOT, "lib/i18n/catalog/admin.ts");
let adminTs = fs.readFileSync(adminPath, "utf8");
if (!adminTs.includes("admin-misc")) {
  adminTs = adminTs.replace(
    'import { adminOperationsHubMessages } from "./admin-operations-hub";',
    'import { adminOperationsHubMessages } from "./admin-operations-hub";\nimport { adminMiscMessages } from "./admin-misc";'
  );
  for (const loc of ["ko", "en", '"zh-CN"']) {
    const spread = `    ...adminMiscMessages[${loc}],\n`;
    const anchor =
      loc === '"zh-CN"'
        ? "    ...adminOperationsHubMessages[\"zh-CN\"],"
        : `    ...adminOperationsHubMessages.${loc},`;
    if (adminTs.includes(anchor) && !adminTs.includes(`...adminMiscMessages[${loc}]`)) {
      adminTs = adminTs.replace(anchor, anchor + "\n" + spread.trimEnd());
    }
  }
  fs.writeFileSync(adminPath, adminTs);
}

const mapOut = Object.fromEntries([...stringToKey.entries()].map(([s, { key }]) => [s, key]));
fs.writeFileSync(path.join(ROOT, ".tmp-admin-misc-string-map.json"), JSON.stringify(mapOut, null, 2));

console.log("catalog keys:", Object.keys(ko).length);
console.log("files changed:", changed);
