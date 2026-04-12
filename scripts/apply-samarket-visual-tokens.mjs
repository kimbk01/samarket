#!/usr/bin/env node
/**
 * neutral 팔레트(gray/slate/zinc/neutral/stone) 및 순수 흰·검 Tailwind 클래스를
 * Samarket `sam-*` 토큰 기반 유틸로 일괄 치환합니다.
 * 실행: node scripts/apply-samarket-visual-tokens.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".git", "coverage", "__tests__"]);
const EXT = new Set([".tsx", ".ts", ".css"]);

const NEUTRAL = "gray|slate|zinc|neutral|stone";
const PREFIXES =
  "bg|text|border|ring|outline|divide|from|to|via|placeholder|caret|accent|decoration|fill|stroke|shadow|ring-offset";

/** @param {number} s */
function mapText(s) {
  if (s >= 700) return "sam-fg";
  if (s >= 500) return "sam-muted";
  return "sam-meta";
}

/** @param {number} s */
function mapBg(s) {
  if (s <= 50) return "sam-app";
  if (s <= 100) return "sam-surface-muted";
  if (s <= 200) return "sam-border-soft";
  if (s <= 300) return "sam-surface-muted";
  if (s <= 400) return "sam-primary-soft";
  if (s <= 600) return "sam-muted";
  if (s <= 700) return "sam-fg/10";
  if (s === 800) return "sam-surface-dark";
  return "sam-ink";
}

/** @param {number} s */
function mapBorderToken(s) {
  if (s <= 100) return "sam-border-soft";
  return "sam-border";
}

/**
 * @param {string} prefix
 * @param {number} shade
 */
function mapUtility(prefix, shade) {
  switch (prefix) {
    case "text":
      return `text-${mapText(shade)}`;
    case "placeholder":
      return "placeholder-sam-meta";
    case "bg":
      return `bg-${mapBg(shade)}`;
    case "from":
      return `from-${mapBg(shade)}`;
    case "to":
      return `to-${mapBg(shade)}`;
    case "via":
      return `via-${mapBg(shade)}`;
    case "border":
      return `border-${mapBorderToken(shade)}`;
    case "divide":
      return `divide-${mapBorderToken(shade)}`;
    case "outline":
      return `outline-${mapBorderToken(shade)}`;
    case "ring": {
      const t = mapBorderToken(shade);
      return `ring-${t}`;
    }
    case "ring-offset":
      return shade <= 150 ? "ring-offset-sam-surface-muted" : "ring-offset-sam-border";
    case "fill":
      return `fill-${mapBg(shade)}`;
    case "stroke":
      return `stroke-${mapText(shade)}`;
    case "caret":
      return "caret-sam-primary";
    case "accent":
      return "accent-sam-primary";
    case "decoration":
      return `decoration-${mapText(shade)}`;
    case "shadow":
      return "shadow-sam-card";
    default:
      return null;
  }
}

/**
 * @param {string} content
 * @returns {string}
 */
function transform(content) {
  const re = new RegExp(
    `\\b(${PREFIXES})-(${NEUTRAL})-(\\d{2,3})((?:/(?:\\d+|\\[[^\\]]+\\]))?)\\b`,
    "g"
  );
  const out = content.replace(re, (full, prefix, _fam, shadeStr, opacity) => {
    const shade = parseInt(shadeStr, 10);
    const mapped = mapUtility(prefix, shade);
    if (!mapped) return full;
    return mapped + (opacity || "");
  });

  const opSuffix = "((?:/(?:\\d+|\\[[^\\]]+\\]))?)";
  let o = out;
  o = o.replace(new RegExp(`\\bbg-white${opSuffix}\\b`, "g"), (_, op) => `bg-sam-surface${op || ""}`);
  o = o.replace(new RegExp(`\\bborder-white${opSuffix}\\b`, "g"), (_, op) => `border-sam-surface${op || ""}`);
  o = o.replace(new RegExp(`\\bring-white${opSuffix}\\b`, "g"), (_, op) => `ring-sam-surface${op || ""}`);
  o = o.replace(new RegExp(`\\btext-black${opSuffix}\\b`, "g"), (_, op) => `text-sam-fg${op || ""}`);
  o = o.replace(new RegExp(`\\bborder-black${opSuffix}\\b`, "g"), (_, op) => `border-sam-fg${op || ""}`);
  return o;
}

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (EXT.has(path.extname(name))) files.push(p);
  }
  return files;
}

function main() {
  const dirs = [path.join(root, "app"), path.join(root, "components")];
  let totalFiles = 0;
  let changedFiles = 0;

  for (const base of dirs) {
    if (!fs.existsSync(base)) continue;
    const files = walk(base);
    for (const file of files) {
      totalFiles++;
      const before = fs.readFileSync(file, "utf8");
      const after = transform(before);
      if (after !== before) {
        changedFiles++;
        fs.writeFileSync(file, after, "utf8");
      }
    }
  }

  console.log(`Scanned ${totalFiles} files, updated ${changedFiles} files.`);
}

main();
