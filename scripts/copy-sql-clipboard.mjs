/**
 * SQL 파일 내용을 클립보드로 복사 (한글 UTF-8 유지)
 * 사용: node scripts/copy-sql-clipboard.mjs <프로젝트 루트 기준 상대경로>
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rel = process.argv[2];
if (!rel) {
  console.error("사용법: npm run sql:copy:dangnae   또는");
  console.error("  node scripts/copy-sql-clipboard.mjs supabase/scripts/파일.sql");
  process.exit(1);
}

const abs = path.resolve(process.cwd(), rel);
if (!fs.existsSync(abs)) {
  console.error("파일 없음:", abs);
  process.exit(1);
}

const text = fs.readFileSync(abs, "utf8");

if (process.platform === "win32") {
  const lit = abs.replace(/'/g, "''");
  const cmd = `Get-Content -LiteralPath '${lit}' -Raw -Encoding UTF8 | Set-Clipboard`;
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || "PowerShell 실패");
    process.exit(1);
  }
} else if (process.platform === "darwin") {
  execSync("pbcopy", { input: text, encoding: "utf8" });
} else {
  try {
    execSync("xclip -selection clipboard", { input: text, encoding: "utf8" });
  } catch {
    console.error("xclip 없음. 수동으로 파일을 여세요:", abs);
    process.exit(1);
  }
}

console.log("클립보드에 복사됨:", path.relative(process.cwd(), abs));
console.log("길이:", text.length, "자 → Supabase SQL Editor에 Ctrl+V");
