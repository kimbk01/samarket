#!/usr/bin/env node
/**
 * One-shot PTR calibration PNGs — visible safe/status/chrome zones + rulers.
 * Phone 1280×320 · tablet 2560×320 · optional logo 256×256.
 * Output: .tmp/ptr-calibration/
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const OUT = resolve(process.cwd(), ".tmp/ptr-calibration");

/** Matches PTR_BAND_SPECS hold Y + zone X fractions (ptr-reveal-contract). */
const HOLD_Y0 = (1 - 58 / 106) / 2; // ≈0.226
const HOLD_Y1 = 1 - HOLD_Y0;

const SPECS = {
  phone: {
    w: 1280,
    h: 320,
    file: "ptr-cal-phone-1280x320.png",
    zones: {
      safe: { x0: 0.1, x1: 0.32, color: { r: 16, g: 185, b: 129, alpha: 0.55 } },
      status: { x0: 0.32, x1: 0.68, color: { r: 244, g: 63, b: 94, alpha: 0.45 } },
      chrome: { x0: 0.68, x1: 0.9, color: { r: 14, g: 165, b: 233, alpha: 0.5 } },
    },
  },
  tablet: {
    w: 2560,
    h: 320,
    file: "ptr-cal-tablet-2560x320.png",
    zones: {
      safe: { x0: 0.16, x1: 0.4, color: { r: 16, g: 185, b: 129, alpha: 0.55 } },
      status: { x0: 0.4, x1: 0.6, color: { r: 244, g: 63, b: 94, alpha: 0.45 } },
      chrome: { x0: 0.6, x1: 0.84, color: { r: 14, g: 165, b: 233, alpha: 0.5 } },
    },
  },
};

function zoneSvg(spec) {
  const { w, h, zones } = spec;
  const y0 = Math.round(HOLD_Y0 * h);
  const y1 = Math.round(HOLD_Y1 * h);
  const zh = y1 - y0;
  const parts = [];
  // background grid
  parts.push(`<rect width="${w}" height="${h}" fill="#1e1b4b"/>`);
  for (let x = 0; x <= w; x += 80) {
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#4338ca" stroke-width="1"/>`);
    parts.push(`<text x="${x + 4}" y="14" fill="#a5b4fc" font-size="11" font-family="monospace">${x}</text>`);
  }
  for (let y = 0; y <= h; y += 40) {
    parts.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#312e81" stroke-width="1"/>`);
  }
  for (const [name, z] of Object.entries(zones)) {
    const x = Math.round(z.x0 * w);
    const zw = Math.round((z.x1 - z.x0) * w);
    const { r, g, b, alpha } = z.color;
    parts.push(
      `<rect x="${x}" y="${y0}" width="${zw}" height="${zh}" fill="rgba(${r},${g},${b},${alpha})" stroke="rgba(${r},${g},${b},0.95)" stroke-width="2" stroke-dasharray="6 4"/>`
    );
    parts.push(
      `<text x="${x + 8}" y="${y0 + 22}" fill="#fff" font-size="18" font-family="sans-serif" font-weight="700">${name.toUpperCase()}</text>`
    );
  }
  parts.push(
    `<text x="${w / 2}" y="${h / 2 + 8}" text-anchor="middle" fill="#fef08a" font-size="28" font-family="sans-serif" font-weight="700">${w}×${h} CAL</text>`
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join("")}</svg>`;
}

async function writeBand(key) {
  const spec = SPECS[key];
  const svg = Buffer.from(zoneSvg(spec));
  const buf = await sharp(svg).png().toBuffer();
  const path = resolve(OUT, spec.file);
  writeFileSync(path, buf);
  console.log("[ok]", path, buf.length);
  return path;
}

async function writeLogo() {
  const w = 256;
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}">
    <rect width="${w}" height="${w}" fill="#7c3aed"/>
    <circle cx="128" cy="128" r="72" fill="none" stroke="#fef08a" stroke-width="6"/>
    <text x="128" y="136" text-anchor="middle" fill="#fff" font-size="28" font-family="sans-serif" font-weight="700">LOGO</text>
  </svg>`);
  const buf = await sharp(svg).png().toBuffer();
  const path = resolve(OUT, "ptr-cal-logo-256.png");
  writeFileSync(path, buf);
  console.log("[ok]", path, buf.length);
  return path;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await writeBand("phone");
  await writeBand("tablet");
  await writeLogo();
  console.log("[done] OUT=", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
