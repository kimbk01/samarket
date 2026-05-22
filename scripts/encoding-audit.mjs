/**
 * Text file encoding audit & conversion (UTF-16 / UTF-8 BOM → UTF-8 no BOM).
 * Usage: node scripts/encoding-audit.mjs scan | convert
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  ".vercel",
]);

const EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".html",
  ".sql",
  ".yml",
  ".yaml",
]);

const SPECIAL_NAMES = new Set([".env.example"]);

const MOJIBAKE = [
  /Ã[\x80-\xBF]/,
  /â€[™œžŸ]/,
  /ï¿½/,
  /\\u00c3\\u00/,
];

/** @param {string} rel */
function isTarget(rel, name) {
  if (SPECIAL_NAMES.has(name) || name.endsWith(".env.example")) return true;
  return EXTS.has(path.extname(name).toLowerCase());
}

/** @param {Buffer} raw */
function classifyBom(raw) {
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) return "utf16le";
  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) return "utf16be";
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf)
    return "utf8bom";
  return null;
}

/** @param {Buffer} raw */
function utf16NoBomHeuristic(raw) {
  const sample = raw.subarray(0, Math.min(4096, raw.length));
  if (sample.length < 8) return false;
  let nulls = 0;
  for (const b of sample) if (b === 0) nulls++;
  return nulls > Math.max(10, sample.length / 10);
}

/** @param {Buffer} raw @param {string | null} kind */
function decodeToString(raw, kind) {
  if (kind === "utf16le") return raw.subarray(2).toString("utf16le");
  if (kind === "utf16be") {
    // swap to LE for Node decode
    const body = raw.subarray(2);
    const swapped = Buffer.alloc(body.length);
    for (let i = 0; i + 1 < body.length; i += 2) {
      swapped[i] = body[i + 1];
      swapped[i + 1] = body[i];
    }
    return swapped.toString("utf16le");
  }
  if (kind === "utf8bom") return raw.subarray(3).toString("utf8");
  return raw.toString("utf8");
}

/** @param {string} rel @param {string} text */
function suspectBrokenKorean(rel, text) {
  const reasons = [];
  const lower = rel.toLowerCase();
  for (const pat of MOJIBAKE) {
    if (pat.test(text)) {
      reasons.push("mojibake");
      break;
    }
  }
  if (
    lower.includes("messages/") ||
    lower.includes("locales/") ||
    lower.includes("i18n")
  ) {
    if (text.includes("\uFFFD") || text.includes("ï¿½"))
      reasons.push("replacement-char-in-i18n");
  }
  return reasons;
}

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (EXCLUDE_DIRS.has(ent.name)) continue;
      walk(path.join(dir, ent.name), files);
    } else if (ent.isFile()) {
      const full = path.join(dir, ent.name);
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      if (isTarget(rel, ent.name)) files.push({ full, rel, name: ent.name });
    }
  }
  return files;
}

function scan() {
  const files = walk(ROOT);
  /** @type {string[]} */
  const utf16_le = [];
  /** @type {string[]} */
  const utf16_be = [];
  /** @type {string[]} */
  const utf8_bom = [];
  /** @type {string[]} */
  const utf16_no_bom_suspect = [];
  /** @type {{ path: string, reason: string }[]} */
  const broken_suspect = [];

  for (const { full, rel } of files) {
    let raw;
    try {
      raw = fs.readFileSync(full);
    } catch {
      continue;
    }
    if (raw.length === 0) continue;

    const kind = classifyBom(raw);
    if (kind === "utf16le") utf16_le.push(rel);
    else if (kind === "utf16be") utf16_be.push(rel);
    else if (kind === "utf8bom") utf8_bom.push(rel);
    else if (utf16NoBomHeuristic(raw)) utf16_no_bom_suspect.push(rel);

    let text;
    try {
      text = decodeToString(raw, kind);
    } catch {
      broken_suspect.push({ path: rel, reason: "undecodable" });
      continue;
    }
    const reasons = suspectBrokenKorean(rel, text);
    if (reasons.length) {
      broken_suspect.push({ path: rel, reason: reasons.join(",") });
    }
  }

  return {
    scanned: files.length,
    utf16_le,
    utf16_be,
    utf8_bom,
    utf16_no_bom_suspect,
    broken_suspect,
  };
}

/** @param {ReturnType<typeof scan>} result */
function convert(result) {
  const jobs = [
    ...result.utf16_le.map((p) => [p, "utf16le"]),
    ...result.utf16_be.map((p) => [p, "utf16be"]),
    ...result.utf8_bom.map((p) => [p, "utf8bom"]),
  ];
  /** @type {string[]} */
  const converted = [];
  /** @type {{ path: string, error: string }[]} */
  const json_errors = [];

  for (const [rel, kind] of jobs) {
    const full = path.join(ROOT, rel);
    const raw = fs.readFileSync(full);
    const text = decodeToString(raw, kind);
    fs.writeFileSync(full, text, { encoding: "utf8" }); // no BOM
    converted.push(rel);
    if (path.extname(rel).toLowerCase() === ".json") {
      try {
        JSON.parse(text);
      } catch (e) {
        json_errors.push({
          path: rel,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return { converted, json_errors };
}

const mode = process.argv[2] ?? "scan";
const result = scan();
const outScan = path.join(ROOT, "scripts", "_encoding_audit_result.json");
fs.writeFileSync(outScan, JSON.stringify(result, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      scanned: result.scanned,
      utf16_le: result.utf16_le.length,
      utf16_be: result.utf16_be.length,
      utf8_bom: result.utf8_bom.length,
      utf16_no_bom_suspect: result.utf16_no_bom_suspect.length,
      broken_suspect: result.broken_suspect.length,
    },
    null,
    2,
  ),
);

if (mode === "convert") {
  const conv = convert(result);
  const outConv = path.join(ROOT, "scripts", "_encoding_convert_result.json");
  fs.writeFileSync(outConv, JSON.stringify(conv, null, 2), "utf8");
  console.log("converted:", conv.converted.length);
  if (conv.json_errors.length) console.log("json_errors:", conv.json_errors);
}
