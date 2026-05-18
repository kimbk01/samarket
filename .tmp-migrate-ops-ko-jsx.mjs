import fs from "fs";
import path from "path";

const FOLDERS = [
  "ops-knowledge-graph",
  "ops-learning",
  "ops-routines",
  "ops-runbooks",
  "ops-maturity",
  "ops-knowledge",
];

const catalog = fs.readFileSync("lib/i18n/catalog/admin-ops-tools.ts", "utf8");
const koBlock = catalog.match(/ko:\s*\{([\s\S]*?)\n  \},\n  en:/)?.[1] ?? "";
const pairs = [...koBlock.matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[2], m[1]]);
pairs.sort((a, b) => b[0].length - a[0].length);

const LABEL_BLOCK =
  /const (\w+)(?::[^=]+)?\s*=\s*\{[^{}]*[\u3131-\uD7A3][^{}]*\};?\s*\n/g;

const LABEL_MAP = {
  STATUS_LABELS: "OPS_TOOLS_CHECKLIST_STATUS_KEYS",
  PRIORITY_LABELS: "OPS_TOOLS_PRIORITY_KEYS",
  CATEGORY_LABELS: "OPS_TOOLS_CHECKLIST_CATEGORY_KEYS",
  SURFACE_LABELS: "OPS_TOOLS_SURFACE_KEYS",
  NODE_TYPE_LABELS: "OPS_TOOLS_NODE_TYPE_KEYS",
  EDGE_TYPE_LABELS: "OPS_TOOLS_EDGE_TYPE_KEYS",
  OUTCOME_LABELS: "OPS_TOOLS_RESOLUTION_KEYS",
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
  LOG_ACTION_LABELS: "OPS_TOOLS_PATTERN_LOG_KEYS",
  SCORE_LABELS: "OPS_TOOLS_MATURITY_SCORE_KEYS",
  KPI_LABELS: "OPS_TOOLS_KPI_KEYS",
  SOURCE_LABELS: "OPS_TOOLS_KB_SOURCE_KEYS",
  VIEW_SOURCE_LABELS: "OPS_TOOLS_VIEW_SOURCE_KEYS",
  AREA_LABELS: "OPS_TOOLS_ROADMAP_AREA_KEYS",
  ROADMAP_STATUS_LABELS: "OPS_TOOLS_ROADMAP_STATUS_KEYS",
  DOC_TYPE_LABELS: null,
  CATEGORY_LABELS_KB: "OPS_TOOLS_KB_CATEGORY_KEYS",
};

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patch(content, file) {
  if (!content.includes('"use client"')) return content;
  let c = content.replace(/<motion-free-[^>]*>\s*/g, "");

  if (!c.includes("useI18n")) {
    c = c.replace(
      '"use client";\n\n',
      '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n'
    );
  }
  if (!c.includes("const { t } = useI18n()")) {
    c = c.replace(/(export function \w+[^{]*\{)\n/, "$1\n  const { t } = useI18n();\n");
  }

  const usedMaps = new Set();
  for (const m of c.matchAll(LABEL_BLOCK)) {
    const name = m[1];
    const constName = LABEL_MAP[name];
    if (constName) usedMaps.add(constName);
    c = c.replace(m[0], "");
    if (constName) {
      c = c.replace(
        new RegExp(`${name}\\[([^\\]]+)\\]`, "g"),
        `t(opsToolsLabel(${constName}, $1))`
      );
    }
  }

  if (usedMaps.size > 0 && !c.includes("opsToolsLabel")) {
    const imports = [...usedMaps, "opsToolsLabel"].join(",\n  ");
    c = c.replace(
      /import \{ useI18n \}[^\n]+\n/,
      `$&import {\n  ${imports},\n} from "@/components/admin/i18n/admin-ops-tools-label-keys";\n`
    );
  }

  for (const [ko, key] of pairs) {
    const e = esc(ko);
    c = c.replace(new RegExp(`>\\s*${e}\\s*<`, "g"), `>{t("${key}")}<`);
    c = c.replace(new RegExp(`placeholder=["']${e}["']`, "g"), `placeholder={t("${key}")}`);
    c = c.replace(
      new RegExp(`(confirm|alert)\\(["']${e}["']\\)`, "g"),
      `$1(t("${key}"))`
    );
    c = c.replace(
      new RegExp(`title=\\{?["']${e}["']\\}?`, "g"),
      `titleKey="${key}"`
    );
    c = c.replace(
      new RegExp(`<AdminCard title=["']${e}["']`, "g"),
      `<AdminCard titleKey="${key}"`
    );
  }

  c = c.replace(
    /<AdminPageHeader\s+title="([^"]+)"(?:\s+description="([^"]+)")?/g,
    (_, title, desc) => {
      const tk = pairs.find(([k]) => k === title)?.[1];
      const dk = desc ? pairs.find(([k]) => k === desc)?.[1] : null;
      if (!tk) return _;
      return `<AdminPageHeader titleKey="${tk}"${dk ? ` descriptionKey="${dk}"` : ""}`;
    }
  );

  c = c.replace(/label: "([^"]+)"/g, (full, label) => {
    const key = pairs.find(([k]) => k === label)?.[1];
    if (!key) return full;
    return `labelKey: "${key}"`;
  });
  if (c.includes("labelKey:") && file.includes("Page") && !c.includes("MessageKey")) {
    c = c.replace(
      /import \{ useI18n \}[^\n]+\n/,
      `$&import type { MessageKey } from "@/lib/i18n/messages";\n`
    );
    c = c.replace(/labelKey: "admin_/g, 'labelKey: "admin_').replace(
      /const TABS[^[]*\[\]/,
      (m) => m.replace(/labelKey: "/g, 'labelKey: "').replace(/: \{ id/g, ": { id")
    );
    c = c.replace(/\{tab\.label\}/g, "{t(tab.labelKey)}");
    c = c.replace(/labelKey: "(admin_[^"]+)"/g, "labelKey: \"$1\" as MessageKey");
  }

  c = c.replace(/"관리자"/g, 't("admin_ops_tools_admin_nickname")');
  c = c.replace(/ADMIN_NICK = "관리자"/g, 'ADMIN_NICK = t("admin_ops_tools_admin_nickname")');

  return c;
}

for (const folder of FOLDERS) {
  const dir = path.join("components/admin", folder);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".tsx")) continue;
    const fp = path.join(dir, f);
    const out = patch(fs.readFileSync(fp, "utf8"), f);
    fs.writeFileSync(fp, out);
    console.log("patched", folder, f);
  }
}
