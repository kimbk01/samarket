#!/usr/bin/env node
/**
 * Build deterministic Trade National LGU projection from vendored PSA PSGC source.
 *
 * Input:  data/trade-national-lgu/source/psgc-2025-2q/{regions,provinces,muncities}.json
 * Output: data/trade-national-lgu/{lgu-projection,legacy-alias-map,local-area-map,build-report}.json
 *
 * Idempotent: same source → same projection (stable sort).
 * Does NOT apply DB migrations / does NOT touch posts rows.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const DATA = join(ROOT, "data/trade-national-lgu");
const SOURCE = join(DATA, "source/psgc-2025-2q");
const DATASET_VERSION = "PSGC-2025-2Q";

/** Explicit legacy product alias → PSGC canonical_id (29). */
const LEGACY_ALIAS_TO_CANONICAL = Object.freeze({
  "manila-city": "1380600000",
  makati: "1380300000",
  taguig: "1381500000",
  pasig: "1381200000",
  mandaluyong: "1380500000",
  paranaque: "1381000000",
  "las-pinas": "1380200000",
  muntinlupa: "1380800000",
  marikina: "1380700000",
  caloocan: "1380100000",
  valenzuela: "1381600000",
  malabon: "1380400000",
  navotas: "1380900000",
  "san-juan": "1381400000",
  pasay: "1381100000",
  pateros: "1381701000",
  "quezon-city": "1381300000",
  "cebu-city": "0730600000",
  mandaue: "0731300000",
  "lapu-lapu": "0731100000",
  consolacion: "0702219000",
  liloan: "0702227000",
  talisay: "0702250000",
  minglanilla: "0702232000",
  "naga-cebu": "0702234000",
  toledo: "0702251000",
  carcar: "0702214000",
  cordova: "0702220000",
  angeles: "0330100000",
});

/** Explicit provider/display aliases → canonical (deterministic; not fuzzy). */
const DISPLAY_ALIASES = Object.freeze([
  ["pasig", "1381200000"],
  ["pasig city", "1381200000"],
  ["city of pasig", "1381200000"],
  ["makati", "1380300000"],
  ["makati city", "1380300000"],
  ["city of makati", "1380300000"],
  ["quezon city", "1381300000"],
  ["city of quezon", "1381300000"],
  ["manila", "1380600000"],
  ["manila city", "1380600000"],
  ["city of manila", "1380600000"],
  ["cebu city", "0730600000"],
  ["city of cebu", "0730600000"],
  ["angeles", "0330100000"],
  ["angeles city", "0330100000"],
  ["city of angeles", "0330100000"],
  ["davao", "1130700000"],
  ["davao city", "1130700000"],
  ["city of davao", "1130700000"],
  ["baguio", "1430300000"],
  ["baguio city", "1430300000"],
  ["city of baguio", "1430300000"],
  ["iloilo", "0631000000"],
  ["iloilo city", "0631000000"],
  ["city of iloilo", "0631000000"],
  ["bacolod", "1830200000"],
  ["bacolod city", "1830200000"],
  ["city of bacolod", "1830200000"],
  ["cagayan de oro", "1030500000"],
  ["cagayan de oro city", "1030500000"],
  ["city of cagayan de oro", "1030500000"],
  ["general santos", "1230800000"],
  ["general santos city", "1230800000"],
  ["city of general santos", "1230800000"],
  ["gensan", "1230800000"],
  ["puerto princesa", "1731500000"],
  ["puerto princesa city", "1731500000"],
  ["city of puerto princesa", "1731500000"],
  ["cainta", "0405805000"],
  ["taguig", "1381500000"],
  ["taguig city", "1381500000"],
  ["city of taguig", "1381500000"],
  ["paranaque", "1381000000"],
  ["parañaque", "1381000000"],
  ["paranaque city", "1381000000"],
  ["parañaque city", "1381000000"],
  ["las pinas", "1380200000"],
  ["las piñas", "1380200000"],
  ["las pinas city", "1380200000"],
  ["las piñas city", "1380200000"],
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function stripDiacritics(s) {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeName(raw) {
  let s = stripDiacritics(String(raw ?? "").toLowerCase()).trim();
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function canonicalFromMunCity(m, hucProvCodes) {
  const code = String(m.psgcCode ?? "").trim();
  if (code.length === 10 && /^\d{10}$/.test(code)) return code;
  const rc = String(m.regCode ?? "").padStart(2, "0");
  const pc = String(m.provCode ?? "").padStart(3, "0");
  if (hucProvCodes.has(String(m.provCode))) {
    return `${rc}${pc}00000`;
  }
  const mc = String(m.munCityCode ?? "");
  if (/^\d{5}$/.test(mc)) return `${rc}${mc}000`;
  throw new Error(`Cannot normalize PSGC for ${m.munCityName} (${code})`);
}

function isCityName(name) {
  const n = name.trim();
  return n.startsWith("City of ") || n.endsWith(" City");
}

function displayNameFor(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim();
}

function buildProjection(regions, provinces, muncities) {
  const regionByCode = new Map(
    regions.map((r) => [String(r.regCode).padStart(2, "0"), displayNameFor(r.regionName)])
  );
  const hucByProv = new Map();
  for (const p of provinces) {
    if (p.cityClass) hucByProv.set(String(p.provCode), p);
  }
  const provinceByKey = new Map();
  for (const p of provinces) {
    if (p.cityClass) continue;
    const key = `${String(p.regCode).padStart(2, "0")}|${String(p.provCode).padStart(3, "0")}`;
    provinceByKey.set(key, displayNameFor(p.provName));
  }

  const rows = [];
  const excludedSubMun = [];

  for (const m of muncities) {
    const provCode = String(m.provCode);
    const munCityCode = String(m.munCityCode ?? "");
    const isHucParent = hucByProv.has(provCode);
    const munSuffix = munCityCode.slice(-2);
    if (isHucParent && munSuffix !== "00") {
      excludedSubMun.push({
        name: displayNameFor(m.munCityName),
        psgcCode: m.psgcCode,
        munCityCode,
      });
      continue;
    }

    const canonicalId = canonicalFromMunCity(m, hucByProv);
    const regionCode = String(m.regCode).padStart(2, "0");
    const regionName = regionByCode.get(regionCode);
    if (!regionName) {
      throw new Error(`Missing region for ${canonicalId}`);
    }

    let provinceCode = null;
    let provinceName = null;
    let lguType;

    if (isHucParent) {
      lguType = "city";
      provinceCode = null;
      provinceName = null;
    } else {
      const pKey = `${regionCode}|${provCode.padStart(3, "0")}`;
      const pName = provinceByKey.get(pKey) ?? null;
      // NCR municipality without province row (e.g. Pateros under 817) — province nullable.
      provinceCode = pName ? provCode.padStart(3, "0") : null;
      provinceName = pName;
      lguType = isCityName(displayNameFor(m.munCityName)) ? "city" : "municipality";
    }

    rows.push({
      canonical_id: canonicalId,
      lgu_type: lguType,
      display_name: displayNameFor(m.munCityName),
      region_code: regionCode,
      region_name: regionName,
      province_code: provinceCode,
      province_name: provinceName,
      is_active: true,
      dataset_version: DATASET_VERSION,
      superseded_by: null,
      old_name: displayNameFor(m.munCityOldName) || null,
    });
  }

  rows.sort((a, b) => a.canonical_id.localeCompare(b.canonical_id));
  return { rows, excludedSubMun };
}

function buildAliases(rows) {
  const byId = new Map(rows.map((r) => [r.canonical_id, r]));
  const aliases = [];
  const seen = new Set();

  function add(alias, canonicalId, kind) {
    const a = normalizeName(alias);
    if (!a) return;
    const key = `${a}|${canonicalId}|${kind}`;
    if (seen.has(key)) return;
    if (!byId.has(canonicalId)) {
      throw new Error(`Alias ${alias} → missing canonical ${canonicalId}`);
    }
    seen.add(key);
    aliases.push({
      alias: a,
      alias_raw: alias,
      canonical_id: canonicalId,
      kind,
    });
  }

  for (const [legacy, cid] of Object.entries(LEGACY_ALIAS_TO_CANONICAL)) {
    add(legacy, cid, "legacy_product");
  }
  for (const [alias, cid] of DISPLAY_ALIASES) {
    add(alias, cid, "provider_display");
  }
  for (const r of rows) {
    add(r.display_name, r.canonical_id, "display_name");
    if (r.old_name) add(r.old_name, r.canonical_id, "old_name");
  }

  aliases.sort((a, b) =>
    a.alias === b.alias
      ? a.canonical_id.localeCompare(b.canonical_id)
      : a.alias.localeCompare(b.alias)
  );
  return aliases;
}

/**
 * Local-area map from trade-lgu-city-rollup INTERNAL_TO_LGU constants.
 * Duplicated here so the build script stays dependency-free (no TS import).
 * Must stay in sync with lib/trade/location/trade-lgu-city-rollup.ts — validated by unit test.
 */
function buildLocalAreaMapFromLegacy(regionsData) {
  const INTERNAL_TO_LGU = {
    "manila|m1": "manila-city",
    "manila|m3": "manila-city",
    "manila|m4": "manila-city",
    "manila|m5": "manila-city",
    "manila|m6": "manila-city",
    "manila|m7": "manila-city",
    "manila|m8": "manila-city",
    "manila|m9": "manila-city",
    "manila|m10": "manila-city",
    "manila|m11": "manila-city",
    "manila|m12": "manila-city",
    "manila|m13": "manila-city",
    "manila|m14": "manila-city",
    "manila|m15": "manila-city",
    "manila|m16": "manila-city",
    "manila|m17": "manila-city",
    "manila|m2": "makati",
    "manila|m39": "makati",
    "manila|m40": "makati",
    "manila|m18": "taguig",
    "manila|m19": "taguig",
    "manila|m20": "pasig",
    "manila|m21": "pasig",
    "manila|m22": "pasig",
    "manila|m23": "mandaluyong",
    "manila|m24": "mandaluyong",
    "manila|m25": "paranaque",
    "manila|m26": "paranaque",
    "manila|m27": "las-pinas",
    "manila|m28": "muntinlupa",
    "manila|m29": "marikina",
    "manila|m30": "caloocan",
    "manila|m31": "caloocan",
    "manila|m32": "valenzuela",
    "manila|m33": "malabon",
    "manila|m34": "navotas",
    "manila|m35": "san-juan",
    "manila|m36": "pasay",
    "manila|m37": "pasay",
    "manila|m38": "pateros",
  };

  const CEBU_NON_CITY = {
    c2: "mandaue",
    c26: "consolacion",
    c27: "liloan",
    c28: "lapu-lapu",
    c29: "lapu-lapu",
    c30: "talisay",
    c31: "minglanilla",
    c32: "naga-cebu",
    c33: "toledo",
    c34: "carcar",
    c35: "cordova",
  };

  for (const c of regionsData.find((r) => r.id === "quezon")?.cities ?? []) {
    INTERNAL_TO_LGU[`quezon|${c.id}`] = "quezon-city";
  }
  for (const c of regionsData.find((r) => r.id === "angeles")?.cities ?? []) {
    INTERNAL_TO_LGU[`angeles|${c.id}`] = "angeles";
  }
  for (const c of regionsData.find((r) => r.id === "cebu")?.cities ?? []) {
    INTERNAL_TO_LGU[`cebu|${c.id}`] = CEBU_NON_CITY[c.id] ?? "cebu-city";
  }

  const rows = [];
  const unmapped = [];
  for (const region of regionsData) {
    for (const city of region.cities) {
      const key = `${region.id}|${city.id}`;
      const legacy = INTERNAL_TO_LGU[key];
      if (!legacy) {
        unmapped.push({ regionId: region.id, cityId: city.id, name: city.name });
        continue;
      }
      const canonicalId = LEGACY_ALIAS_TO_CANONICAL[legacy];
      if (!canonicalId) {
        unmapped.push({
          regionId: region.id,
          cityId: city.id,
          name: city.name,
          legacy,
        });
        continue;
      }
      rows.push({
        region_id: region.id,
        city_id: city.id,
        legacy_lgu_alias: legacy,
        canonical_id: canonicalId,
      });
    }
  }
  rows.sort((a, b) =>
    a.region_id === b.region_id
      ? a.city_id.localeCompare(b.city_id)
      : a.region_id.localeCompare(b.region_id)
  );
  return { rows, unmapped, internalToLgu: INTERNAL_TO_LGU };
}

function validate(projection, aliases, localMap, legacyCount) {
  const errors = [];
  const ids = projection.map((r) => r.canonical_id);
  if (new Set(ids).size !== ids.length) errors.push("duplicate canonical id");

  for (const r of projection) {
    if (!r.display_name) errors.push(`empty display_name ${r.canonical_id}`);
    if (r.lgu_type !== "city" && r.lgu_type !== "municipality") {
      errors.push(`invalid type ${r.canonical_id}`);
    }
    if (!r.region_code || !r.region_name) errors.push(`invalid region ${r.canonical_id}`);
  }

  const byId = new Set(ids);
  for (const [legacy, cid] of Object.entries(LEGACY_ALIAS_TO_CANONICAL)) {
    if (!byId.has(cid)) errors.push(`legacy ${legacy} → missing ${cid}`);
  }
  if (Object.keys(LEGACY_ALIAS_TO_CANONICAL).length !== legacyCount) {
    errors.push(`legacy count != ${legacyCount}`);
  }

  for (const kind of ["legacy_product", "provider_display"]) {
    const map = new Map();
    for (const a of aliases.filter((x) => x.kind === kind)) {
      const prev = map.get(a.alias);
      if (prev && prev !== a.canonical_id) {
        errors.push(`${kind} alias conflict ${a.alias}: ${prev} vs ${a.canonical_id}`);
      } else {
        map.set(a.alias, a.canonical_id);
      }
    }
  }
  // display_name / old_name may collide across provinces — resolver uses AMBIGUOUS.

  return errors;
}

function main() {
  mkdirSync(DATA, { recursive: true });
  const regions = readJson(join(SOURCE, "regions.json"));
  const provinces = readJson(join(SOURCE, "provinces.json"));
  const muncities = readJson(join(SOURCE, "muncities.json"));
  const provenance = readJson(join(DATA, "PROVENANCE.json"));

  const { rows, excludedSubMun } = buildProjection(regions, provinces, muncities);
  const aliases = buildAliases(rows);

  // Parse REGIONS from regions-data.ts via a tiny regex extract of city ids — prefer
  // reading the compiled rollup through a sibling JSON emitted by tests. Here we
  // require the TypeScript catalog shape via dynamic import of a generated snapshot.
  // Fallback: read regions-data by evaluating exported structure from a JSON dump
  // we keep in sync — for build, load from lib via child process is heavy; instead
  // read the existing rollup test expectation by importing regions from a prebuilt
  // list extracted below.
  const regionsData = extractRegionsData();
  const local = buildLocalAreaMapFromLegacy(regionsData);

  const errors = validate(rows, aliases, local.rows, 29);
  if (local.unmapped.length) {
    errors.push(`local unmapped ${local.unmapped.length}`);
  }

  const cityCount = rows.filter((r) => r.lgu_type === "city").length;
  const munCount = rows.filter((r) => r.lgu_type === "municipality").length;

  const legacyMapped = Object.entries(LEGACY_ALIAS_TO_CANONICAL).filter(([, cid]) =>
    rows.some((r) => r.canonical_id === cid)
  ).length;

  const report = {
    dataset_version: DATASET_VERSION,
    provenance,
    totals: {
      selectable_lgu: rows.length,
      city: cityCount,
      municipality: munCount,
      excluded_sub_municipality: excludedSubMun.length,
      aliases: aliases.length,
      local_area_mapped: local.rows.length,
      local_area_unmapped: local.unmapped.length,
      legacy_lgu: Object.keys(LEGACY_ALIAS_TO_CANONICAL).length,
      legacy_mapped: legacyMapped,
    },
    gates: {
      duplicate_canonical: 0,
      legacy_29: legacyMapped === 29 && Object.keys(LEGACY_ALIAS_TO_CANONICAL).length === 29,
      local_143: local.unmapped.length === 0 && local.rows.length === regionsData.reduce((n, r) => n + r.cities.length, 0),
      errors,
    },
    source_checksums: provenance.source_files,
    projection_sha256: null,
  };

  if (errors.length) {
    console.error("BUILD FAILED", errors);
    writeFileSync(join(DATA, "build-report.json"), JSON.stringify(report, null, 2) + "\n");
    process.exit(1);
  }

  const projectionDoc = {
    dataset_version: DATASET_VERSION,
    generated_by: "scripts/trade/build-psgc-trade-national-lgu.mjs",
    lgu: rows,
  };
  const aliasDoc = {
    dataset_version: DATASET_VERSION,
    aliases,
  };
  const localDoc = {
    dataset_version: DATASET_VERSION,
    rows: local.rows,
  };

  const projText = JSON.stringify(projectionDoc, null, 2) + "\n";
  report.projection_sha256 = sha256(projText);
  report.gates.duplicate_canonical = 0;

  writeFileSync(join(DATA, "lgu-projection.json"), projText);
  writeFileSync(join(DATA, "legacy-alias-map.json"), JSON.stringify(aliasDoc, null, 2) + "\n");
  writeFileSync(join(DATA, "local-area-map.json"), JSON.stringify(localDoc, null, 2) + "\n");
  writeFileSync(join(DATA, "build-report.json"), JSON.stringify(report, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        ok: true,
        selectable: rows.length,
        city: cityCount,
        municipality: munCount,
        legacy_mapped: legacyMapped,
        local_mapped: local.rows.length,
        projection_sha256: report.projection_sha256,
      },
      null,
      2
    )
  );
}

/** Minimal REGIONS extract: parse lib/products/regions-data.ts city id lists. */
function extractRegionsData() {
  const src = readFileSync(join(ROOT, "lib/products/regions-data.ts"), "utf8");
  // Match region blocks: id: "manila" ... cities: [ { id: "m1", ...}, ...]
  const regions = [];
  const regionRe = /{\s*id:\s*"([^"]+)"[\s\S]*?cities:\s*\[([\s\S]*?)\]\s*,/g;
  let m;
  while ((m = regionRe.exec(src))) {
    const id = m[1];
    if (!["manila", "quezon", "cebu", "angeles"].includes(id)) continue;
    const body = m[2];
    const cities = [];
    const cityRe = /{\s*id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]*)"/g;
    let c;
    while ((c = cityRe.exec(body))) {
      cities.push({ id: c[1], name: c[2] });
    }
    regions.push({ id, cities });
  }
  if (regions.length !== 4) {
    throw new Error(`Expected 4 REGIONS, got ${regions.length}`);
  }
  return regions;
}

main();
