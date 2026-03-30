/**
 * 앱 라우트 구조 자가 점검 (CI·로컬에서 `npm run verify:routes`)
 * - 메인 UI 는 반드시 라우트 그룹 app/(main)/ 아래 (URL 에 (main) 안 붙음)
 * - app/_shell 은 Next normalizeAppPath 가 URL 에서 제거하지 않아 404 원인이 됨 — 금지
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appDir = path.join(root, "app");

function mustDir(rel, msg) {
  const p = path.join(appDir, ...rel.split("/"));
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
    console.error("[verify:routes]", msg, "→ 없음:", rel);
    process.exit(1);
  }
}

function mustNotDir(rel, msg) {
  const p = path.join(appDir, ...rel.split("/"));
  if (fs.existsSync(p)) {
    console.error("[verify:routes]", msg, "→ 제거 필요:", rel);
    process.exit(1);
  }
}

mustDir("(main)", "메인 앱 라우트 그룹");
mustDir("(main)/home", "홈 페이지 세그먼트");
mustNotDir("_shell", "잘못된 _shell (URL 이 /_shell/... 가 됨)");
mustNotDir("(app)", "(app) 과 (main) 중복 방지 — 과거 이름만 남지 않았는지");

console.log("[verify:routes] OK — app/(main) 구조, 금지 폴더 없음");
