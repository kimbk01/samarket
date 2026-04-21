/**
 * 제품 UI: 임의 text-[Npx] 를 sam-text-* 시맨틱 클래스로 치환 (import 불필요).
 * components/admin 디렉터리 제외.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "components");
const COMPONENTS_ADMIN_ROOT = path.join(ROOT, "admin");

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (p === COMPONENTS_ADMIN_ROOT || p.startsWith(`${COMPONENTS_ADMIN_ROOT}${path.sep}`)) {
        continue;
      }
      walk(p, out);
    } else if (name.isFile() && name.name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

function mapPxToClass(px) {
  const n = Math.round(Number(px));
  if (n <= 11) return "sam-text-xxs";
  if (n === 12) return "sam-text-helper";
  if (n === 13) return "sam-text-body-secondary";
  if (n <= 15) return "sam-text-body";
  if (n === 16) return "sam-text-body-lg";
  if (n === 17) return "sam-text-section-title";
  if (n <= 20) return "sam-text-page-title";
  return "sam-text-hero";
}

const TEXT_PX_RE = /text-\[(\d+(?:\.\d+)?)px\]/g;

function transformSource(src) {
  if (!src.includes("text-[")) return { changed: false, src };
  const next = src.replace(TEXT_PX_RE, (_, n) => mapPxToClass(n));
  return { changed: next !== src, src: next };
}

function main() {
  const files = walk(ROOT);
  let touched = 0;
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const { changed, src } = transformSource(raw);
    if (changed) {
      fs.writeFileSync(file, src, "utf8");
      touched++;
      console.log(path.relative(process.cwd(), file));
    }
  }
  console.log("files updated:", touched);
}

main();
