import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const scanPath = path.join(ROOT, ".tmp-phase7-findings.json");
const businessCatalogPath = path.join(ROOT, "lib/i18n/catalog/business.ts");

const reuseKeyByKo = new Map([
  ["불러오는 중…", "common_loading"],
  ["로그인이 필요합니다.", "common_login_required"],
  ["다시 시도", "common_retry"],
  ["닫기", "common_close"],
  ["저장", "common_save"],
  ["취소", "common_cancel"],
  ["확인", "common_confirm"],
  ["삭제", "common_delete"],
  ["매장 보기", "common_view_store"],
  ["매장", "common_store"],
  ["배달", "common_delivery"],
  ["요청", "common_request"],
  ["없음", "common_none"],
  ["목록으로", "common_to_list"],
  ["처리 중…", "common_processing"],
]);

function ensureUseI18n(filePath, source) {
  let next = source;
  if (!next.includes('from "@/components/i18n/AppLanguageProvider"')) {
    const lines = next.split(/\r?\n/);
    const importLine = 'import { useI18n } from "@/components/i18n/AppLanguageProvider";';
    let insertAt = 0;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].startsWith("import ")) insertAt = i + 1;
    }
    lines.splice(insertAt, 0, importLine);
    next = lines.join("\n");
  }

  if (next.includes("const { t } = useI18n();")) return next;

  const candidates = [
    /export default function [A-Za-z0-9_]+\s*\([^)]*\)\s*\{/m,
    /export function [A-Za-z0-9_]+\s*\([^)]*\)\s*\{/m,
    /function [A-Z][A-Za-z0-9_]*\s*\([^)]*\)\s*\{/m,
    /const [A-Z][A-Za-z0-9_]*\s*=\s*\([^)]*\)\s*=>\s*\{/m,
  ];
  for (const re of candidates) {
    const m = re.exec(next);
    if (!m) continue;
    const at = m.index + m[0].length;
    next = `${next.slice(0, at)}\n  const { t } = useI18n();${next.slice(at)}`;
    return next;
  }
  console.warn(`[phase7] unable to inject useI18n in ${filePath}`);
  return next;
}

function makeKeyMap(uniqueTexts) {
  const keyByText = new Map();
  for (const text of uniqueTexts) {
    if (reuseKeyByKo.has(text)) {
      keyByText.set(text, reuseKeyByKo.get(text));
    }
  }
  const remaining = uniqueTexts.filter((text) => !keyByText.has(text));
  remaining.sort((a, b) => a.localeCompare(b, "ko"));
  remaining.forEach((text, index) => {
    const key = `business_phase7_${String(index + 1).padStart(3, "0")}`;
    keyByText.set(text, key);
  });
  return keyByText;
}

function toTemplateAndVars(rawText) {
  let i = 0;
  const vars = [];
  const template = rawText.replace(/\{([^}]+)\}/g, (_, expr) => {
    i += 1;
    const name = `v${i}`;
    vars.push({ name, expr: expr.trim() });
    return `{${name}}`;
  });
  return { template, vars };
}

function replaceAttrLiteral(line, text, key, varsExpr) {
  const tokens = [`"${text}"`, `'${text}'`, `\`${text}\``];
  for (const tok of tokens) {
    const idx = line.indexOf(tok);
    if (idx >= 0) {
      return `${line.slice(0, idx)}{t("${key}"${varsExpr})}${line.slice(idx + tok.length)}`;
    }
  }
  return line;
}

function replaceInLine(line, finding, key) {
  const { text, kind } = finding;
  const { vars } = toTemplateAndVars(text);
  const varsExpr =
    vars.length === 0 ? "" : `, { ${vars.map((v) => `${v.name}: ${v.expr}`).join(", ")} }`;
  const tExpr = `{t("${key}"${varsExpr})}`;

  if (kind === "attr") {
    return replaceAttrLiteral(line, text, key, varsExpr);
  }
  if (kind === "dialog") {
    return line
      .replace(`confirm("${text}")`, `confirm(t("${key}"${varsExpr}))`)
      .replace(`alert("${text}")`, `alert(t("${key}"${varsExpr}))`)
      .replace(`confirm('${text}')`, `confirm(t("${key}"${varsExpr}))`)
      .replace(`alert('${text}')`, `alert(t("${key}"${varsExpr}))`);
  }
  if (kind === "toast") {
    return line
      .replace(`toast.success("${text}")`, `toast.success(t("${key}"${varsExpr}))`)
      .replace(`toast.error("${text}")`, `toast.error(t("${key}"${varsExpr}))`)
      .replace(`toast.info("${text}")`, `toast.info(t("${key}"${varsExpr}))`)
      .replace(`toast.warning("${text}")`, `toast.warning(t("${key}"${varsExpr}))`)
      .replace(`toast.success('${text}')`, `toast.success(t("${key}"${varsExpr}))`)
      .replace(`toast.error('${text}')`, `toast.error(t("${key}"${varsExpr}))`)
      .replace(`toast.info('${text}')`, `toast.info(t("${key}"${varsExpr}))`)
      .replace(`toast.warning('${text}')`, `toast.warning(t("${key}"${varsExpr}))`);
  }
  // kind === text
  if (line.includes(text)) {
    return line.replace(text, tExpr);
  }
  return line;
}

function buildCatalogSource(entries) {
  const koLines = [];
  const enLines = [];
  for (const entry of entries) {
    const koVal = JSON.stringify(entry.template);
    // Phase7: English keeps parity-first fallback; can be refined later.
    const enVal = JSON.stringify(entry.template);
    koLines.push(`    ${entry.key}: ${koVal},`);
    enLines.push(`    ${entry.key}: ${enVal},`);
  }
  return `export const businessMessages = {
  ko: {
${koLines.join("\n")}
  },
  en: {
${enLines.join("\n")}
  },
} as const;
`;
}

const scan = JSON.parse(fs.readFileSync(scanPath, "utf8"));
const findings = scan.findings;
const unique = scan.unique;
const keyByText = makeKeyMap(unique);

const fileToFindings = new Map();
for (const finding of findings) {
  if (!fileToFindings.has(finding.file)) fileToFindings.set(finding.file, []);
  fileToFindings.get(finding.file).push(finding);
}

const unresolved = [];
const touched = [];
for (const [rel, rows] of fileToFindings.entries()) {
  const abs = path.join(ROOT, rel);
  const raw = fs.readFileSync(abs, "utf8");
  let lines = raw.split(/\r?\n/);
  let changed = false;

  const byLine = new Map();
  for (const row of rows) {
    if (!byLine.has(row.line)) byLine.set(row.line, []);
    byLine.get(row.line).push(row);
  }
  for (const [lineNo, group] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    const idx = lineNo - 1;
    let line = lines[idx];
    for (const finding of group) {
      const key = keyByText.get(finding.text);
      const nextLine = replaceInLine(line, finding, key);
      if (nextLine === line) {
        unresolved.push({ file: rel, line: lineNo, text: finding.text, kind: finding.kind });
      } else {
        line = nextLine;
        changed = true;
      }
    }
    lines[idx] = line;
  }

  if (changed) {
    let next = lines.join("\n");
    next = ensureUseI18n(rel, next);
    fs.writeFileSync(abs, next, "utf8");
    touched.push(rel);
  }
}

const generatedEntries = [];
for (const text of unique) {
  const key = keyByText.get(text);
  if (reuseKeyByKo.has(text)) continue;
  const { template } = toTemplateAndVars(text);
  generatedEntries.push({ key, template });
}
generatedEntries.sort((a, b) => a.key.localeCompare(b.key));
fs.writeFileSync(businessCatalogPath, buildCatalogSource(generatedEntries), "utf8");

fs.writeFileSync(
  path.join(ROOT, ".tmp-phase7-unresolved.json"),
  JSON.stringify(unresolved, null, 2),
  "utf8"
);

console.log(`[phase7-migrate] touched=${touched.length} unresolved=${unresolved.length}`);
