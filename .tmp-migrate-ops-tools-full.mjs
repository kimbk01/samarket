/**
 * Full i18n migration for ops-tools admin folders.
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const FOLDERS = [
  "ops-board",
  "ops-knowledge-graph",
  "ops-learning",
  "ops-routines",
  "ops-runbooks",
  "ops-maturity",
  "ops-knowledge",
];

const LABEL_IMPORT =
  'import {\n  OPS_TOOLS_ACTION_SOURCE_KEYS,\n  OPS_TOOLS_ACTION_STATUS_KEYS,\n  OPS_TOOLS_CHECKLIST_CATEGORY_KEYS,\n  OPS_TOOLS_CHECKLIST_STATUS_KEYS,\n  OPS_TOOLS_EDGE_TYPE_KEYS,\n  OPS_TOOLS_KB_SOURCE_KEYS,\n  OPS_TOOLS_KPI_KEYS,\n  OPS_TOOLS_LEARNING_SOURCE_KEYS,\n  OPS_TOOLS_LEARNING_TYPE_KEYS,\n  OPS_TOOLS_MATURITY_SCORE_KEYS,\n  OPS_TOOLS_NODE_TYPE_KEYS,\n  OPS_TOOLS_PATTERN_LOG_KEYS,\n  OPS_TOOLS_PATTERN_STATUS_KEYS,\n  OPS_TOOLS_PERIOD_KEYS,\n  OPS_TOOLS_PRIORITY_KEYS,\n  OPS_TOOLS_RESOLUTION_KEYS,\n  OPS_TOOLS_RESULT_OUTCOME_KEYS,\n  OPS_TOOLS_ROADMAP_AREA_KEYS,\n  OPS_TOOLS_ROADMAP_STATUS_KEYS,\n  OPS_TOOLS_ROUTINE_CATEGORY_KEYS,\n  OPS_TOOLS_ROUTINE_EXEC_STATUS_KEYS,\n  OPS_TOOLS_RUNBOOK_EXEC_STATUS_KEYS,\n  OPS_TOOLS_RUNBOOK_LINK_KEYS,\n  OPS_TOOLS_RUNBOOK_LOG_KEYS,\n  OPS_TOOLS_RUNBOOK_STEP_STATUS_KEYS,\n  OPS_TOOLS_SUGGESTION_STATUS_KEYS,\n  OPS_TOOLS_SUGGESTION_TYPE_KEYS,\n  OPS_TOOLS_SURFACE_KEYS,\n  OPS_TOOLS_TREND_KEYS,\n  OPS_TOOLS_VIEW_SOURCE_KEYS,\n  opsToolsLabel,\n} from "@/components/admin/i18n/admin-ops-tools-label-keys";\n';

const MAP_TO_CONST = {
  STATUS_LABELS: "OPS_TOOLS_ACTION_STATUS_KEYS",
  PRIORITY_LABELS: "OPS_TOOLS_PRIORITY_KEYS",
  SOURCE_LABELS: "OPS_TOOLS_ACTION_SOURCE_KEYS",
  CATEGORY_LABELS: "OPS_TOOLS_CHECKLIST_CATEGORY_KEYS",
  SURFACE_LABELS: "OPS_TOOLS_SURFACE_KEYS",
  NODE_TYPE_LABELS: "OPS_TOOLS_NODE_TYPE_KEYS",
  EDGE_TYPE_LABELS: "OPS_TOOLS_EDGE_TYPE_KEYS",
  OUTCOME_LABELS: "OPS_TOOLS_RESOLUTION_KEYS",
  PATTERN_STATUS: "OPS_TOOLS_PATTERN_STATUS_KEYS",
  LOG_ACTION_LABELS: "OPS_TOOLS_PATTERN_LOG_KEYS",
  TREND_LABELS: "OPS_TOOLS_TREND_KEYS",
  SOURCE_TYPE_LABELS: "OPS_TOOLS_LEARNING_SOURCE_KEYS",
  LEARNING_TYPE_LABELS: "OPS_TOOLS_LEARNING_TYPE_KEYS",
  SUGGESTION_TYPE_LABELS: "OPS_TOOLS_SUGGESTION_TYPE_KEYS",
  SUGGESTION_STATUS_LABELS: "OPS_TOOLS_SUGGESTION_STATUS_KEYS",
  ROUTINE_CATEGORY_LABELS: "OPS_TOOLS_ROUTINE_CATEGORY_KEYS",
  PERIOD_LABELS: "OPS_TOOLS_PERIOD_KEYS",
  EXEC_STATUS_LABELS: "OPS_TOOLS_ROUTINE_EXEC_STATUS_KEYS",
  EXECUTION_STATUS_LABELS: "OPS_TOOLS_RUNBOOK_EXEC_STATUS_KEYS",
  LINK_TYPE_LABELS: "OPS_TOOLS_RUNBOOK_LINK_KEYS",
  STEP_STATUS_LABELS: "OPS_TOOLS_RUNBOOK_STEP_STATUS_KEYS",
  LOG_LABELS: "OPS_TOOLS_RUNBOOK_LOG_KEYS",
  OUTCOME_OPTIONS: "OPS_TOOLS_RESULT_OUTCOME_KEYS",
  ROADMAP_STATUS_LABELS: "OPS_TOOLS_ROADMAP_STATUS_KEYS",
  AREA_LABELS: "OPS_TOOLS_ROADMAP_AREA_KEYS",
  SCORE_LABELS: "OPS_TOOLS_MATURITY_SCORE_KEYS",
  KPI_LABELS: "OPS_TOOLS_KPI_KEYS",
  SOURCE_LABELS_KB: "OPS_TOOLS_KB_SOURCE_KEYS",
  VIEW_SOURCE_LABELS: "OPS_TOOLS_VIEW_SOURCE_KEYS",
};

/** Korean string -> message key */
const KO_TO_KEY = JSON.parse(
  fs.readFileSync(".tmp-ops-ko-key-map.json", "utf8")
);

function addUseI18n(content) {
  if (content.includes("useI18n")) return content;
  const imp = 'import { useI18n } from "@/components/i18n/AppLanguageProvider";\n';
  if (content.startsWith('"use client";')) {
    return content.replace('"use client";\n\n', `"use client";\n\n${imp}`);
  }
  return imp + content;
}

function addHook(content) {
  if (content.includes("const { t } = useI18n()")) return content;
  return content.replace(
    /(export function \w+[^{]*\{)\n/,
    "$1\n  const { t } = useI18n();\n"
  );
}

function stripLabelConsts(content) {
  let c = content;
  for (const name of Object.keys(MAP_TO_CONST)) {
    c = c.replace(
      new RegExp(
        `const ${name}[^=]*=\\s*\\{[\\s\\S]*?\\};\\s*\\n`,
        "m"
      ),
      ""
    );
  }
  // SURFACE_OPTIONS array
  c = c.replace(
    /const SURFACE_OPTIONS[^=]*=\s*\[[\s\S]*?\];\s*\n/g,
    ""
  );
  return c;
}

function replaceLabelRefs(content) {
  let c = content;
  for (const [name, constName] of Object.entries(MAP_TO_CONST)) {
    c = c.replace(
      new RegExp(`${name}\\[([^\\]]+)\\]`, "g"),
      `opsToolsLabel(${constName}, $1)`
    );
  }
  return c;
}

function replaceKoStrings(content) {
  let c = content;
  for (const [ko, key] of Object.entries(KO_TO_KEY)) {
    const esc = ko.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    c = c.replace(new RegExp(`>\\s*${esc}\\s*<`, "g"), `>{t("${key}")}<`);
    c = c.replace(
      new RegExp(`placeholder=["']${esc}["']`, "g"),
      `placeholder={t("${key}")}`
    );
    c = c.replace(
      new RegExp(`title=["']${esc}["']`, "g"),
      `titleKey="${key}"`
    );
    c = c.replace(
      new RegExp(`title=\\{["']${esc}["']\\}`, "g"),
      `titleKey="${key}"`
    );
    c = c.replace(
      new RegExp(`(confirm|alert)\\(["']${esc}["']\\)`, "g"),
      `$1(t("${key}"))`
    );
    // default title strings in code
    c = c.replace(
      new RegExp(`(["'])${esc}\\1`, "g"),
      `t("${key}")`
    );
  }
  // AdminCard title=
  c = c.replace(/<AdminCard title="/g, '<AdminCard titleKey="');
  c = c.replace(/titleKey="([^"]+)"/g, (m, t) => {
    const key = KO_TO_KEY[t];
    return key ? `titleKey="${key}"` : m;
  });
  c = c.replace(
    /<AdminPageHeader\s+title="([^"]+)"(?:\s+description="([^"]+)")?/g,
    (_, title, desc) => {
      const tk = KO_TO_KEY[title];
      const dk = desc ? KO_TO_KEY[desc] : null;
      if (!tk) return _;
      return `<AdminPageHeader titleKey="${tk}"${dk ? ` descriptionKey="${dk}"` : ""}`;
    }
  );
  return c;
}

function processFile(rel) {
  const full = path.join(ROOT, "components/admin", rel);
  let content;
  try {
    content = execSync(`git show HEAD:${full.replace(/\\/g, "/")}`, {
      encoding: "utf8",
      cwd: ROOT,
    });
  } catch {
    content = fs.readFileSync(full, "utf8");
  }
  content = content.replace(/<motion-free-[^>]*>\s*/g, "");
  content = addUseI18n(content);
  content = stripLabelConsts(content);
  content = replaceLabelRefs(content);
  content = addHook(content);
  content = replaceKoStrings(content);
  if (content.includes("opsToolsLabel") && !content.includes("admin-ops-tools-label-keys")) {
    content = content.replace(
      /("use client";\n\n)/,
      `$1${LABEL_IMPORT}\n`
    );
  }
  if (rel.includes("AdminOps") && content.includes("labelKey")) {
    content = content.replace(
      /import { useI18n }[^\n]+\n/,
      '$&import type { MessageKey } from "@/lib/i18n/messages";\n'
    );
    content = content.replace(/label: string/g, "labelKey: MessageKey");
    content = content.replace(/\{tab\.label\}/g, "{t(tab.labelKey)}");
  }
  fs.writeFileSync(full, content);
  console.log("ok", rel);
}

// Build KO_TO_KEY from catalog
const catalog = fs.readFileSync("lib/i18n/catalog/admin-ops-tools.ts", "utf8");
const koBlock = catalog.match(/ko:\s*\{([\s\S]*?)\n  \},\n  en:/)?.[1] ?? "";
const KO_TO_KEY = {};
for (const m of koBlock.matchAll(/(\w+):\s*"([^"]+)"/g)) {
  KO_TO_KEY[m[2]] = m[1];
}
fs.writeFileSync(".tmp-ops-ko-key-map.json", JSON.stringify(KO_TO_KEY));

for (const folder of FOLDERS) {
  const dir = path.join(ROOT, "components/admin", folder);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".tsx")) continue;
    processFile(`${folder}/${f}`);
  }
}
