/**
 * Patch ops-tools components: add useI18n + replace Korean UI strings with t().
 */
import fs from "fs";
import path from "path";

const ROOT = "components/admin";
const FOLDERS = [
  "ops-board",
  "ops-knowledge-graph",
  "ops-learning",
  "ops-routines",
  "ops-runbooks",
  "ops-maturity",
  "ops-knowledge",
];

const REPLACEMENTS = [
  ['"use client";\n\nimport { useMemo', '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\nimport { useMemo'],
  ['"use client";\n\nimport { useState', '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\nimport { useState'],
  ['"use client";\n\nimport Link', '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\nimport Link'],
  ['"use client";\n\nimport type', '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\nimport type'],
];

/** file-relative replacements after useI18n import exists */
const TEXT_MAP = [
  ["운영 보드", 't("admin_ops_tools_board_page_title")'],
  ["일일 점검 체크리스트·운영 회고·액션아이템", 't("admin_ops_tools_board_page_desc")'],
  ["요약 카드", 't("admin_ops_tools_board_tab_summary")'],
  ["일일 체크리스트", 't("admin_ops_tools_board_tab_checklist")'],
  ["체크리스트 템플릿", 't("admin_ops_tools_board_tab_templates")'],
  ["운영 회고", 't("admin_ops_tools_board_tab_retro")'],
  ["액션아이템 보드", 't("admin_ops_tools_board_tab_actions")'],
  ["운영 요약", 't("admin_ops_tools_board_card_summary")'],
  ["일일 점검 체크리스트", 't("admin_ops_tools_board_card_checklist")'],
  ["회고 목록", 't("admin_ops_tools_board_card_retro_list")'],
  ["점검일", 't("admin_ops_tools_board_check_date")'],
  ["체크리스트 완료율", 't("admin_ops_tools_board_checklist_rate")'],
  ["미완료 액션아이템", 't("admin_ops_tools_board_open_actions")'],
  ["기한 초과", 't("admin_ops_tools_board_overdue")'],
  ["최근 회고", 't("admin_ops_tools_board_latest_retro")'],
  ["템플릿으로 당일 체크리스트 생성", 't("admin_ops_tools_board_gen_checklist")'],
  ["체크리스트 템플릿이 없습니다.", 't("admin_ops_tools_board_tpl_empty")'],
  ["운영 회고가 없습니다. 새 회고를 작성해 주세요.", 't("admin_ops_tools_board_retro_empty")'],
  ["새 운영 회고", 't("admin_ops_tools_board_retro_new")'],
  ["회고 저장", 't("admin_ops_tools_board_save_retro")'],
  ["액션아이템이 없습니다.", 't("admin_ops_tools_board_no_actions")'],
  ["전체 상태", 't("admin_ops_tools_board_filter_status")'],
  ["운영 지식 그래프", 't("admin_ops_tools_kg_page_title")'],
  ["운영 학습", 't("admin_ops_tools_learning_page_title")'],
  ["장기 운영 / 월간 루틴", 't("admin_ops_tools_routines_page_title")'],
  ["운영 런북 실행", 't("admin_ops_tools_runbook_page_title")'],
  ["운영 성숙도", 't("admin_ops_tools_maturity_page_title")'],
  ["운영 지식베이스", 't("admin_ops_tools_kb_page_title")'],
];

function ensureUseI18nHook(content, fnName) {
  if (content.includes("const { t } = useI18n()")) return content;
  const re = new RegExp(`(export function ${fnName}\\([^)]*\\)\\s*\\{)`);
  if (re.test(content)) {
    return content.replace(re, "$1\n  const { t } = useI18n();");
  }
  const re2 = /(export function \w+\([^)]*\)\s*\{)/;
  if (re2.test(content) && !content.includes("useI18n()")) {
    return content.replace(re2, "$1\n  const { t } = useI18n();", 1);
  }
  return content;
}

function patchFile(filePath) {
  if (filePath.includes("AdminOpsBoardPage")) return;
  let c = fs.readFileSync(filePath, "utf8");
  if (!c.includes('"use client"')) return;
  if (c.includes("useI18n") && c.includes('t("admin_ops_tools_')) return;

  if (!c.includes("useI18n")) {
    for (const [from, to] of REPLACEMENTS) {
      if (c.includes(from.split("\n")[1]?.slice(0, 20) ?? "@@")) {
        c = c.replace(from, to);
        break;
      }
    }
    if (!c.includes("useI18n")) {
      c = c.replace(
        '"use client";\n\n',
        '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n\n'
      );
    }
  }

  const fnMatch = c.match(/export function (\w+)/);
  if (fnMatch) c = ensureUseI18nHook(c, fnMatch[1]);

  for (const [ko, repl] of TEXT_MAP) {
    // JSX text: >한글<
    c = c.replace(new RegExp(`>\\s*${escapeRe(ko)}\\s*<`, "g"), `>{${repl}}<`);
    // placeholder/title
    c = c.replace(
      new RegExp(`(placeholder|title)=["']${escapeRe(ko)}["']`, "g"),
      `$1={${repl}}`
    );
    // confirm/alert
    c = c.replace(
      new RegExp(`(confirm|alert)\\(["']${escapeRe(ko)}["']\\)`, "g"),
      `$1(${repl})`
    );
  }

  fs.writeFileSync(filePath, c);
  console.log("patched", filePath);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const folder of FOLDERS) {
  const dir = path.join(ROOT, folder);
  for (const f of fs.readdirSync(dir)) {
    if (!/\.tsx$/.test(f)) continue;
    patchFile(path.join(dir, f));
  }
}
