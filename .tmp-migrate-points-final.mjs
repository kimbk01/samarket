import fs from "node:fs";
import path from "node:path";

const ROOT = "c:/samarket";
const DIRS = ["components/admin/points", "components/admin/point-policies", "components/admin/point-executions"];
const SKIP = new Set(["admin-points-notifications-i18n.ts"]);

const HELPERS = `import {
  pointActionTypeLabel,
  pointBoardLabel,
  pointChargeStatusLabel,
  pointExecStatusLabel,
  pointExpireCycleLabel,
  pointExpireExecStatusLabel,
  pointLedgerTypeLabel,
  pointPaymentMethodLabel,
  pointRewardTypeLabel,
  pointUserTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";
`;

/** @type {Record<string,string>} */
const KEYS = {}; // filled below from catalog keys - use ko from gen script

// Load keys from generated catalog ko section
const cat = fs.readFileSync(path.join(ROOT, "lib/i18n/catalog/admin-points-notifications.ts"), "utf8");
const koBlock = cat.match(/ko: \{([\s\S]*?)\n  \},\n  en:/)?.[1] ?? "";
for (const m of koBlock.matchAll(/^\s+(admin_[\w]+): "([^"]*)",/gm)) {
  KEYS[m[2]] = m[1];
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name.endsWith(".tsx") && !SKIP.has(e.name)) out.push(f);
  }
  return out;
}

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function migrate(src) {
  if (!src.includes('"use client"')) return src;
  const needsHelpers =
    /POINT_CHARGE_STATUS_LABELS|POINT_PAYMENT_METHOD_LABELS|POINT_LEDGER_ENTRY_LABELS|POINT_EXPIRE_|REWARD_TYPE_LABELS|TARGET_TYPE_LABELS|POINT_REWARD_ACTION_LABELS|POINT_EXECUTION_STATUS_LABELS|USER_TYPE_LABELS|getBoardName/.test(
      src
    );
  if (!src.includes("useI18n")) {
    src = src.replace(
      /^"use client";\r?\n\r?\n/,
      `"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n${needsHelpers ? HELPERS + "\n" : ""}`
    );
    src = src.replace(/(export function \w+[^{]*\{\r?\n)/, `$1  const { t } = useI18n();\n`);
  }
  const titles = {
    "포인트 충전 신청 관리": "admin_points_charge_page_list",
    "포인트 충전 상세": "admin_points_charge_page_detail",
    "포인트 만료": "admin_points_expire_page",
    "포인트 정책": "admin_points_policy_page",
    "포인트 지급/회수 실행": "admin_points_exec_page",
    "포인트 실행 상세": "admin_points_exec_page_detail",
    "신청 정보": "admin_points_charge_card_request_info",
    "관리자 메모 (placeholder)": "admin_points_admin_memo_card",
    "포인트 수동 조정 (placeholder)": "admin_points_charge_card_manual_adjust",
    "변경 이력": "admin_points_card_change_history",
    "적용 정책": "admin_points_expire_card_policy",
    "만료 실행": "admin_points_expire_card_run",
    "실행 결과 요약": "admin_points_expire_card_summary",
    "만료 실행 이력": "admin_points_expire_card_history",
    "만료 로그": "admin_points_expire_card_logs",
    "게시판별 포인트 정책": "admin_points_policy_card_board",
    "확률 구간 (확률형 정책용)": "admin_points_policy_card_probability",
    "이벤트 포인트 배율": "admin_points_policy_card_event",
    "포인트 지급 시뮬레이션": "admin_points_policy_card_simulate",
    "정책 변경 이력": "admin_points_policy_card_logs",
    "테스트 지급 실행": "admin_points_exec_card_test",
    "지급/차단 실행 이력": "admin_points_exec_card_history",
    "포인트 회수 정책": "admin_points_exec_card_reclaim",
    "지급·회수 로그": "admin_points_exec_card_logs",
    "실행 정보": "admin_points_exec_card_info",
    "관련 지급/회수 로그": "admin_points_exec_card_related_logs",
  };
  for (const [ko, key] of Object.entries(titles)) {
    src = src.replaceAll(`title="${ko}"`, `titleKey="${key}"`);
  }
  src = src.replaceAll("POINT_CHARGE_STATUS_LABELS[", "pointChargeStatusLabel(t, ");
  src = src.replaceAll("POINT_PAYMENT_METHOD_LABELS[", "pointPaymentMethodLabel(t, ");
  src = src.replaceAll("POINT_LEDGER_ENTRY_LABELS[", "pointLedgerTypeLabel(t, ");
  src = src.replaceAll("POINT_EXPIRE_RUN_CYCLE_LABELS[", "pointExpireCycleLabel(t, ");
  src = src.replaceAll("POINT_EXPIRE_EXECUTION_STATUS_LABELS[", "pointExpireExecStatusLabel(t, ");
  src = src.replaceAll("REWARD_TYPE_LABELS[", "pointRewardTypeLabel(t, ");
  src = src.replaceAll("TARGET_TYPE_LABELS[", "pointActionTypeLabel(t, ");
  src = src.replaceAll("POINT_REWARD_ACTION_LABELS[", "pointActionTypeLabel(t, ");
  src = src.replaceAll("POINT_EXECUTION_STATUS_LABELS[", "pointExecStatusLabel(t, ");
  src = src.replaceAll("USER_TYPE_LABELS[", "pointUserTypeLabel(t, ");
  src = src.replaceAll("getBoardName(", "pointBoardLabel(t, ");

  // sort by length desc to avoid partial replacements
  const entries = Object.entries(KEYS).sort((a, b) => b[0].length - a[0].length);
  for (const [ko, key] of entries) {
    if (ko.length < 2) continue;
    // object property labels
    src = src.replaceAll(`label: "${ko}"`, `label: t("${key}")`);
    // quoted strings -> t() in JSX expr contexts only when entire string
    src = src.replaceAll(`"${ko}"`, `t("${key}")`);
    // JSX text nodes
    src = src.replace(new RegExp(`>${esc(ko)}<`, "g"), `>{t("${key}")}<`);
    src = src.replace(new RegExp(`\\s+${esc(ko)}\\s*\n`, "g"), ` {t("${key}")}\n`);
    src = src.replaceAll(`placeholder="${ko}"`, `placeholder={t("${key}")}`);
  }
  // cleanup double t() from over-replace
  src = src.replaceAll("t(t(", "t(");
  return src;
}

let n = 0;
for (const dir of DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const orig = fs.readFileSync(file, "utf8");
    const next = migrate(orig);
    if (next !== orig) {
      fs.writeFileSync(file, next);
      n++;
      console.log(path.relative(ROOT, file));
    }
  }
}
console.log("updated", n);
