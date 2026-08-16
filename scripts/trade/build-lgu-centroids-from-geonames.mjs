/**
 * Build `data/trade-national-lgu/lgu-centroids.json` for trade browse radius only.
 *
 * Authority: GeoNames PH dump, matched to PSGC City/Municipality projection by
 * name + province/region key (unique-name fallback when unambiguous).
 * Not for address platform, meet spot, or listing write.
 *
 * Usage (optional regenerate):
 *   curl -fsSL -o /tmp/ph-geonames.zip https://download.geonames.org/export/dump/PH.zip
 *   node scripts/trade/build-lgu-centroids-from-geonames.mjs /tmp/ph-geonames.zip
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "data/trade-national-lgu/lgu-centroids.json");
const PROJ = join(ROOT, "data/trade-national-lgu/lgu-projection.json");

function score(fcode) {
  if (fcode === "PPLC") return 60;
  if (fcode === "PPLA" || fcode === "PPLA2" || fcode === "PPLA3") return 50;
  if (fcode === "ADM3") return 45;
  if (fcode === "PPL") return 20;
  return 5;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^city of\s+/, "")
    .replace(/\s+city$/, "")
    .replace(/^municipality of\s+/, "")
    .replace(/\bsto\./g, "santo")
    .replace(/\bst\./g, "saint")
    .replace(/national capital region.*/, "ncr")
    .replace(/metromanila|metro manila/, "ncr")
    .replace(/[^a-z0-9]+/g, "");
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error("Usage: node scripts/trade/build-lgu-centroids-from-geonames.mjs <PH.zip>");
    process.exit(1);
  }
  const proj = JSON.parse(readFileSync(PROJ, "utf8"));
  const txt = execFileSync("unzip", ["-p", zipPath, "PH.txt"], {
    maxBuffer: 80 * 1024 * 1024,
  }).toString("utf8");
  const rows = txt.split("\n").filter(Boolean);

  const adm2 = new Map();
  for (const line of rows) {
    const p = line.split("\t");
    if (p[7] === "ADM2") adm2.set(`${p[10]}|${p[11]}`, p[1]);
  }

  const byKey = new Map();
  const byName = new Map();
  for (const line of rows) {
    const p = line.split("\t");
    const fclass = p[6];
    const fcode = p[7];
    if (fclass !== "P" && !String(fcode).startsWith("ADM")) continue;
    if (fcode === "ADM1" || fcode === "ADM2") continue;
    const lat = Number(p[4]);
    const lng = Number(p[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const a1 = String(p[10] || "");
    const a2 = String(p[11] || "");
    const provRaw = adm2.get(`${a1}|${a2}`) || (a1 === "NCR" ? "ncr" : a1);
    const provKey = norm(provRaw);
    const sc = score(fcode) + (fclass === "P" ? 2 : 0);
    const names = [p[1], ...(p[3] ? p[3].split(",") : [])];
    for (const nm of names) {
      const n = norm(nm);
      if (!n || n.length < 3) continue;
      const keys = [`${n}|${provKey}`];
      if (a1 === "NCR") keys.push(`${n}|ncr`);
      for (const k of keys) {
        const prev = byKey.get(k);
        if (!prev || sc > prev.score) byKey.set(k, { lat, lng, score: sc });
      }
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n).push({ lat, lng, score: sc });
    }
  }

  function pickUniqueName(n) {
    const list = (byName.get(n) || []).slice().sort((a, b) => b.score - a.score);
    if (!list.length) return null;
    const top = list[0];
    const same = list.filter((x) => x.score >= top.score - 5);
    for (const x of same) {
      if (haversine(top.lat, top.lng, x.lat, x.lng) > 30) return null;
    }
    return top;
  }

  const manual = {};
  const sen =
    byKey.get(`${norm("Senator Ninoy Aquino")}|${norm("Sultan Kudarat")}`) ||
    pickUniqueName(norm("Senator Ninoy Aquino"));
  if (sen) manual["1206512000"] = sen;

  const centroids = {};
  const missing = [];
  for (const lgu of proj.lgu) {
    if (manual[lgu.canonical_id]) {
      const m = manual[lgu.canonical_id];
      centroids[lgu.canonical_id] = {
        lat: Math.round(m.lat * 1e6) / 1e6,
        lng: Math.round(m.lng * 1e6) / 1e6,
      };
      continue;
    }
    const names = [norm(lgu.display_name), norm(lgu.old_name)].filter(Boolean);
    const provKeys = [
      norm(lgu.province_name),
      norm(lgu.region_name),
      lgu.region_code === "13" ? "ncr" : "",
    ].filter(Boolean);

    let hit = null;
    outer: for (const n of names) {
      for (const pk of provKeys) {
        const k = `${n}|${pk}`;
        if (byKey.has(k)) {
          hit = byKey.get(k);
          break outer;
        }
      }
    }
    if (!hit) {
      for (const n of names) {
        const cand = pickUniqueName(n);
        if (cand) {
          hit = cand;
          break;
        }
      }
    }
    if (!hit) {
      missing.push(lgu.canonical_id);
      continue;
    }
    centroids[lgu.canonical_id] = {
      lat: Math.round(hit.lat * 1e6) / 1e6,
      lng: Math.round(hit.lng * 1e6) / 1e6,
    };
  }

  const out = {
    dataset_version: proj.dataset_version,
    generated_by: "scripts/trade/build-lgu-centroids-from-geonames.mjs",
    source: {
      name: "GeoNames PH dump",
      url: "https://download.geonames.org/export/dump/PH.zip",
      role: "trade_browse_radius_lgu_centers_only",
      match: "name+province/region key; unique-name fallback",
    },
    count: Object.keys(centroids).length,
    missing_canonical_ids: missing,
    centroids,
  };
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`wrote ${OUT} count=${out.count} missing=${missing.length}`);
}

main();
