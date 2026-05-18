import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/samarket";
const TARGETS = ["app/(main)/community-messenger", "components/community-messenger"];
const EXT = new Set([".ts", ".tsx"]);

function walk(target, out = []) {
  if (!fs.existsSync(target)) return out;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (EXT.has(path.extname(target))) out.push(target);
    return out;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (EXT.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;

function esc(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function transform(content) {
  let next = content;
  let changed = false;

  // aria-label / placeholder / title / alt
  next = next.replace(
    /\b(aria-label|placeholder|title|alt)\s*=\s*"([^"]*[\u3131-\u318E\uAC00-\uD7A3][^"]*)"/g,
    (_m, attr, text) => {
      changed = true;
      return `${attr}={cmUi("${esc(text)}")}`;
    }
  );
  next = next.replace(
    /\b(aria-label|placeholder|title|alt)\s*=\s*'([^']*[\u3131-\u318E\uAC00-\uD7A3][^']*)'/g,
    (_m, attr, text) => {
      changed = true;
      return `${attr}={cmUi("${esc(text)}")}`;
    }
  );

  // confirm / alert string literal
  next = next.replace(/\b(confirm|alert)\(\s*"([^"]*[\u3131-\u318E\uAC00-\uD7A3][^"]*)"\s*\)/g, (_m, fn, text) => {
    changed = true;
    return `${fn}(cmUi("${esc(text)}"))`;
  });
  next = next.replace(/\b(confirm|alert)\(\s*'([^']*[\u3131-\u318E\uAC00-\uD7A3][^']*)'\s*\)/g, (_m, fn, text) => {
    changed = true;
    return `${fn}(cmUi("${esc(text)}"))`;
  });

  // toast.*("...")
  next = next.replace(
    /\btoast\.(success|error|info|warning)\(\s*"([^"]*[\u3131-\u318E\uAC00-\uD7A3][^"]*)"/g,
    (_m, level, text) => {
      changed = true;
      return `toast.${level}(cmUi("${esc(text)}")`;
    }
  );
  next = next.replace(
    /\btoast\.(success|error|info|warning)\(\s*'([^']*[\u3131-\u318E\uAC00-\uD7A3][^']*)'/g,
    (_m, level, text) => {
      changed = true;
      return `toast.${level}(cmUi("${esc(text)}")`;
    }
  );

  // JSX text node direct literal
  next = next.replace(/>([^<{]*[\u3131-\u318E\uAC00-\uD7A3][^<{]*)</g, (_m, text) => {
    const raw = text;
    const trimmed = raw.trim();
    if (!trimmed || !HANGUL.test(trimmed)) return _m;
    const lead = raw.match(/^\s*/)?.[0] ?? "";
    const trail = raw.match(/\s*$/)?.[0] ?? "";
    changed = true;
    return `>${lead}{cmUi("${esc(trimmed)}")}${trail}<`;
  });

  if (!changed) return { changed: false, content };
  if (next.includes('from "@/lib/i18n/community-messenger-ui"')) {
    return { changed: true, content: next };
  }

  const importLine = 'import { cmUi } from "@/lib/i18n/community-messenger-ui";';
  const lines = next.split(/\r?\n/);
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith("import ")) lastImportIdx = i;
  }
  if (lastImportIdx >= 0) {
    lines.splice(lastImportIdx + 1, 0, importLine);
    next = lines.join("\n");
  } else {
    next = `${importLine}\n${next}`;
  }
  return { changed: true, content: next };
}

let changedFiles = 0;
for (const target of TARGETS) {
  const abs = path.join(ROOT, target);
  for (const file of walk(abs)) {
    const original = fs.readFileSync(file, "utf8");
    const result = transform(original);
    if (!result.changed) continue;
    fs.writeFileSync(file, result.content, "utf8");
    changedFiles += 1;
  }
}

console.log(`updated files: ${changedFiles}`);
