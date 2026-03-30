/**
 * 프로젝트 `.next` + Windows 기본 dev distDir(`%LOCALAPPDATA%\samarket-next-dev-dist`) 정리
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");

function rmQuiet(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

rmQuiet(path.join(root, ".next"));

if (process.platform === "win32") {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  rmQuiet(path.join(base, "samarket-next-dev-dist"));
}
