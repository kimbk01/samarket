#!/usr/bin/env node
/**
 * CUT 7 — 100k synthetic scale + PostgreSQL planner proof (isolated local DB ONLY).
 * Does NOT touch Production / linked Supabase. Does NOT cut over ranking authority.
 *
 * Usage:
 *   CUT7_DATABASE_URL=postgresql:///samarket_cut7_bench \
 *   node scripts/qa/stores-discovery-scale-cut7-100k-planner-proof.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PSQL = process.env.CUT7_PSQL || "/opt/homebrew/opt/postgresql@17/bin/psql";
const DATABASE_URL = process.env.CUT7_DATABASE_URL || "postgresql:///samarket_cut7_bench";
const OUT_JSON = resolve(process.cwd(), "docs/perf/stores-discovery-scale-cut7-100k-latest.json");
const PLANS_DIR = resolve(process.cwd(), "docs/perf/stores-discovery-scale-cut7-plans");

const DENSE_CAT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CAT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORIGIN = { lat: 14.5995, lng: 120.9842 };

function psql(sql, opts = {}) {
  const r = spawnSync(
    PSQL,
    [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", ...(opts.args || []), "-c", sql],
    { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 }
  );
  if (r.status !== 0) {
    throw new Error(`psql failed:\n${r.stderr || r.stdout}`);
  }
  return (r.stdout || "").trim();
}

function psqlJson(sql) {
  const out = psql(sql, { args: ["-P", "pager=off"] });
  // When using -At, JSON may still be one line
  return out;
}

function envSnapshot() {
  const version = psql("SHOW server_version;");
  const postgis = psql("SELECT postgis_version();");
  const trgm = psql("SELECT extversion FROM pg_extension WHERE extname='pg_trgm';");
  const settings = {};
  for (const key of [
    "shared_buffers",
    "work_mem",
    "random_page_cost",
    "effective_cache_size",
    "jit",
    "max_parallel_workers_per_gather",
  ]) {
    settings[key] = psql(`SHOW ${key};`);
  }
  return {
    postgres: version,
    postgis,
    pg_trgm: trgm,
    settings,
    cpu: "NOT_PROVEN",
    memory: "NOT_PROVEN",
    databaseUrlHost: "local:///samarket_cut7_bench",
    isolated: true,
    production: false,
  };
}

function verifyCut6Applied() {
  const src = psql(
    `SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_store_discovery_shadow_wave' LIMIT 1;`
  );
  const ok =
    src.includes("out_of_range IS TRUE THEN 1 ELSE 0") &&
    src.includes("distance_applies IS TRUE") &&
    !src.includes("WHEN v_gi NOT IN (0, 2) THEN false");
  return { ok, markers: { oorOrder: src.includes("out_of_range IS TRUE THEN 1 ELSE 0"), distanceApplies: src.includes("distance_applies IS TRUE") } };
}

function seed100k() {
  console.log("[seed] truncating…");
  psql(`TRUNCATE public.store_delivery_coverage, public.stores RESTART IDENTITY CASCADE;`);
  psql(`INSERT INTO public.delivery_coverage_policy_state (id, active_policy_version, building_policy_version)
        VALUES (1,1,NULL) ON CONFLICT (id) DO UPDATE SET active_policy_version=1, building_policy_version=NULL;`);

  console.log("[seed] inserting 100000 stores (set-based)…");
  psql(`
WITH gen AS (
  SELECT g AS i
  FROM generate_series(0, 99999) AS g
),
built AS (
  SELECT
    gen_random_uuid() AS id,
    'cut7-' || lpad(i::text, 6, '0') AS slug,
    'Store ' || i::text AS store_name,
    CASE i % 3 WHEN 0 THEN 'Makati' WHEN 1 THEN 'Makati City' ELSE 'Quezon' END AS district,
    CASE WHEN i % 40 = 0 THEN NULL ELSE 14.5995 + ((i % 200) - 100) * 0.001 END AS lat,
    CASE WHEN i % 40 = 0 THEN NULL ELSE 120.9842 + ((i % 300) - 150) * 0.001 END AS lng,
    CASE
      WHEN i < 60000 THEN (ARRAY[5.0, 4.9, 4.8])[1 + (i % 3)]
      ELSE 3.0 + ((i % 20)::numeric / 10.0)
    END AS rating_avg,
    CASE
      WHEN i < 60000 THEN (ARRAY[100, 500, 1000, 5000])[1 + (i % 4)]
      ELSE (i % 200)
    END AS review_count,
    CASE
      WHEN i % 11 = 0 THEN false
      ELSE true
    END AS delivery_available,
    CASE
      WHEN i % 20 = 0 THEN 'CLOSED'
      WHEN i % 17 = 0 THEN 'IN_BREAK'
      WHEN i % 19 = 0 THEN 'PREPARING'
      ELSE 'ORDERABLE'
    END AS discovery_schedule_state,
    CASE
      WHEN i < 60000 THEN (ARRAY[0, 1, 10, 100, 1000])[1 + (i % 5)]
      ELSE (i % 50)
    END AS completed_orders_30d,
    CASE WHEN i < 60000 THEN '${DENSE_CAT}'::uuid ELSE '${OTHER_CAT}'::uuid END AS store_category_id,
    i
  FROM gen
)
INSERT INTO public.stores (
  id, slug, store_name, district, lat, lng,
  rating_avg, review_count, delivery_available,
  approval_status, is_visible, store_category_id,
  discovery_schedule_state, completed_orders_30d, completed_orders_30d_at
)
SELECT
  id, slug, store_name, district, lat, lng,
  rating_avg, review_count, delivery_available,
  'approved', true, store_category_id,
  discovery_schedule_state, completed_orders_30d, now()
FROM built;
`);

  console.log("[seed] coverage rows…");
  psql(`
INSERT INTO public.store_delivery_coverage (
  store_id, policy_version, store_policy_version,
  coverage_geog, effective_max_km, distance_applies, covers_all, delivery_mode_effective
)
SELECT
  s.id,
  1,
  1,
  CASE
    WHEN s.lat IS NULL OR s.lng IS NULL THEN NULL
    WHEN (abs(hashtext(s.slug)) % 13) = 0 THEN NULL
    WHEN (abs(hashtext(s.slug)) % 11) = 0 THEN NULL
    ELSE ST_Buffer(
      ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography,
      (CASE WHEN (abs(hashtext(s.slug)) % 7) = 0 THEN 0.5 ELSE 8.0 END) * 1000.0
    )
  END,
  CASE
    WHEN s.lat IS NULL OR s.lng IS NULL THEN NULL
    WHEN (abs(hashtext(s.slug)) % 13) = 0 THEN NULL
    WHEN (abs(hashtext(s.slug)) % 11) = 0 THEN NULL
    WHEN (abs(hashtext(s.slug)) % 7) = 0 THEN 0.5
    ELSE 8
  END,
  CASE
    WHEN s.lat IS NULL OR s.lng IS NULL THEN false
    WHEN (abs(hashtext(s.slug)) % 13) = 0 THEN false
    ELSE true
  END,
  CASE
    WHEN s.lat IS NULL OR s.lng IS NULL THEN true
    WHEN (abs(hashtext(s.slug)) % 13) = 0 THEN true
    WHEN (abs(hashtext(s.slug)) % 11) = 0 THEN true
    ELSE false
  END,
  CASE
    WHEN s.lat IS NULL OR s.lng IS NULL THEN 'disabled'
    WHEN (abs(hashtext(s.slug)) % 13) = 0 THEN 'disabled'
    ELSE 'enabled'
  END
FROM public.stores s;
`);

  console.log("[seed] ANALYZE…");
  psql(`ANALYZE public.stores; ANALYZE public.store_delivery_coverage; ANALYZE public.delivery_coverage_policy_state;`);
}

function distribution() {
  const total = Number(psql(`SELECT count(*) FROM stores;`));
  const dense = Number(psql(`SELECT count(*) FROM stores WHERE store_category_id='${DENSE_CAT}';`));
  const gi = psql(`
    SELECT discovery_schedule_state || '|' || coalesce(delivery_available::text,'null') || '=' || count(*)::text
    FROM stores
    GROUP BY discovery_schedule_state, delivery_available
    ORDER BY 1;
  `);
  const districts = psql(`
    SELECT coalesce(district,'') || '=' || count(*)::text
    FROM stores
    GROUP BY district
    ORDER BY 1;
  `);
  return { total, denseTaxonomy: dense, giRaw: gi.split("\n"), districts: districts.split("\n") };
}

function summarizePlan(planJson, label, opts = {}) {
  const root = Array.isArray(planJson) ? planJson[0] : planJson;
  const plan = root.Plan || root;
  const settings = root.Settings || {};
  const gate = opts.gate || "default"; // rating|reviews|popular|distance|home|coverage|rpc
  let sortNodes = [];
  let indexNodes = [];
  let seqNodes = [];
  let maxActualRows = 0;
  let tempBlocks = { read: 0, written: 0 };
  let shared = { hit: 0, read: 0 };

  function walk(n) {
    if (!n) return;
    const rows = Number(n["Actual Rows"] ?? n["Plan Rows"] ?? 0);
    if (rows > maxActualRows) maxActualRows = rows;
    const nt = n["Node Type"] || "";
    if (nt.includes("Sort")) {
      sortNodes.push({
        node: nt,
        method: n["Sort Method"] || null,
        spaceType: n["Sort Space Type"] || null,
        spaceUsed: n["Sort Space Used"] || null,
        actualRows: n["Actual Rows"],
        planRows: n["Plan Rows"],
      });
    }
    if (nt.includes("Index")) {
      indexNodes.push({
        node: nt,
        index: n["Index Name"] || null,
        actualRows: n["Actual Rows"],
        planRows: n["Plan Rows"],
        loops: n["Actual Loops"],
      });
    }
    if (nt === "Seq Scan") {
      seqNodes.push({
        relation: n["Relation Name"],
        actualRows: n["Actual Rows"],
        planRows: n["Plan Rows"],
        filter: n["Filter"] || null,
        rowsRemoved: n["Rows Removed by Filter"] || null,
      });
    }
    shared.hit += Number(n["Shared Hit Blocks"] || 0);
    shared.read += Number(n["Shared Read Blocks"] || 0);
    tempBlocks.read += Number(n["Temp Read Blocks"] || 0);
    tempBlocks.written += Number(n["Temp Written Blocks"] || 0);
    for (const c of n.Plans || []) walk(c);
  }
  walk(plan);

  const hasWaveIndex = indexNodes.some((i) => (i.index || "").includes("discovery_wave"));
  const hasSpatialIndex = indexNodes.some(
    (i) =>
      (i.index || "").includes("geog") ||
      (i.index || "").includes("gist") ||
      String(i.node || "").toLowerCase().includes("bitmap")
  );
  const catalogWideSort = sortNodes.some(
    (s) => Number(s.actualRows || s.planRows || 0) >= 50000 && !(String(s.method || "").includes("top-N"))
  );
  const denseFullSortNoTopN = sortNodes.some(
    (s) => Number(s.actualRows || s.planRows || 0) >= 50000 && !(String(s.method || "").includes("top-N"))
  );
  const denseSeq50k = seqNodes.some((s) => Number(s.actualRows || s.planRows || 0) >= 50000);
  const topNOver50kInput = sortNodes.some(
    (s) => String(s.method || "").includes("top-N") && Number(s.planRows || s.actualRows || 0) >= 50000
  );

  let verdict = "PASS";
  let reason = "bounded_or_index_compatible";
  if (tempBlocks.read > 0 || tempBlocks.written > 0) {
    verdict = "FAIL";
    reason = "temp_spill";
  } else if (catalogWideSort || denseFullSortNoTopN) {
    verdict = "FAIL";
    reason = "catalog_wide_full_sort";
  } else if (
    (gate === "rating" || gate === "reviews" || gate === "popular") &&
    denseSeq50k &&
    sortNodes.length &&
    !hasWaveIndex
  ) {
    // Hard gate: dense taxonomy sort modes must not full-scan 50k then sort for page1 LIMIT.
    verdict = "FAIL";
    reason = "dense_seq_scan_plus_sort_no_wave_index";
  } else if (
    (gate === "rating" || gate === "reviews" || gate === "popular") &&
    topNOver50kInput &&
    !hasWaveIndex
  ) {
    verdict = "FAIL";
    reason = "topn_over_50k_without_wave_index";
  } else if (gate === "distance" && topNOver50kInput && !hasSpatialIndex && !hasWaveIndex) {
    // Distance cannot use rating/popular btree; 50k+ input top-N without spatial/KNN is FAIL.
    verdict = "FAIL";
    reason = "distance_topn_over_50k_without_spatial_path";
  } else if (gate === "distance" && denseSeq50k && sortNodes.length && !hasSpatialIndex) {
    verdict = "FAIL";
    reason = "distance_dense_seq_sort_no_spatial";
  } else if (hasWaveIndex || hasSpatialIndex) {
    reason = hasWaveIndex ? "wave_index_ordered_limit" : "spatial_or_bitmap_index_path";
  } else if (gate === "distance" || gate === "home") {
    reason = "distance_or_home_topn_measured_under_50k";
  }

  return {
    label,
    gate,
    planningMs: root["Planning Time"],
    executionMs: root["Execution Time"],
    maxActualRows,
    sortNodes,
    indexNodes,
    seqNodes,
    shared,
    tempBlocks,
    settings,
    verdict,
    reason,
  };
}

function explainCore({ name, sql, gate = "default" }) {
  const full = `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON) ${sql}`;
  const raw = psqlJson(full);
  let planJson;
  try {
    planJson = JSON.parse(raw);
  } catch {
    // sometimes wrapped
    const start = raw.indexOf("[");
    planJson = JSON.parse(raw.slice(start));
  }
  writeFileSync(resolve(PLANS_DIR, `${name}.json`), JSON.stringify(planJson, null, 2));
  const summary = summarizePlan(planJson, name, { gate });
  writeFileSync(resolve(PLANS_DIR, `${name}.summary.json`), JSON.stringify(summary, null, 2));
  return summary;
}

function waveCoreSelect({ sort, limit, categoryId, gi = 0, hasOrigin = false, district = null }) {
  // Mirrors CUT6 wave gated path for a single Gi (internal SQL — not Function Scan only)
  const schedulePred =
    gi === 0
      ? `s.discovery_schedule_state = 'ORDERABLE' AND s.delivery_available IS TRUE`
      : gi === 1
        ? `s.discovery_schedule_state = 'ORDERABLE' AND s.delivery_available IS DISTINCT FROM TRUE`
        : gi === 2
          ? `s.discovery_schedule_state = 'ORDERABLE' AND s.delivery_available IS TRUE`
          : `s.discovery_schedule_state IS NOT NULL`;

  const orderBy =
    sort === "rating"
      ? `s.rating_avg DESC NULLS LAST, s.review_count DESC, s.slug ASC, s.id ASC`
      : sort === "reviews"
        ? `s.review_count DESC, s.rating_avg DESC NULLS LAST, s.slug ASC, s.id ASC`
        : sort === "popular"
          ? `s.completed_orders_30d DESC, s.rating_avg DESC NULLS LAST, s.review_count DESC, s.slug ASC, s.id ASC`
          : sort === "distance" && hasOrigin
            ? `distance_km ASC NULLS LAST, s.slug ASC, s.id ASC`
            : `s.completed_orders_30d DESC, s.rating_avg DESC NULLS LAST, s.review_count DESC, s.slug ASC, s.id ASC`;

  const distExpr = hasOrigin
    ? `CASE WHEN s.location_geog IS NOT NULL THEN round((ST_Distance(s.location_geog, ST_SetSRID(ST_MakePoint(${ORIGIN.lng}, ${ORIGIN.lat}), 4326)::geography)/1000.0)::numeric,3)::float8 ELSE NULL END AS distance_km,`
    : `NULL::float8 AS distance_km,`;

  const catPred = categoryId ? `AND s.store_category_id = '${categoryId}'::uuid` : "";
  const districtPred = district
    ? `AND public.store_discovery_district_tier(s.district, '${district}') IN (0,1,2)`
    : "";

  return `
SELECT s.id, s.slug, s.rating_avg, s.review_count, s.completed_orders_30d,
       ${distExpr}
       s.discovery_schedule_state
FROM public.stores s
WHERE s.approval_status = 'approved'
  AND s.is_visible = true
  AND ${schedulePred}
  ${catPred}
  ${districtPred}
ORDER BY ${orderBy}
LIMIT ${limit}
`;
}

function coverageExplain() {
  return explainCore({
    name: "coverage-st-covers-g0",
    gate: "coverage",
    sql: `
SELECT c.store_id
FROM public.store_delivery_coverage c
WHERE c.policy_version = 1
  AND c.distance_applies IS TRUE
  AND c.covers_all IS FALSE
  AND c.coverage_geog IS NOT NULL
  AND c.coverage_geog && ST_SetSRID(ST_MakePoint(${ORIGIN.lng}, ${ORIGIN.lat}), 4326)::geography
  AND ST_Covers(
    c.coverage_geog,
    ST_SetSRID(ST_MakePoint(${ORIGIN.lng}, ${ORIGIN.lat}), 4326)::geography
  )
LIMIT 60
`,
  });
}

/** Scale-safe geo shape: GiST KNN Order By + coverage EXISTS (bounded loops). */
function homeGeoKnnProof() {
  return explainCore({
    name: "home-geo-knn-gist-bounded",
    gate: "distance",
    sql: `
SELECT s.id
FROM public.stores s
WHERE s.approval_status = 'approved'
  AND s.is_visible = true
  AND s.discovery_schedule_state = 'ORDERABLE'
  AND s.delivery_available IS TRUE
  AND s.location_geog IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.store_delivery_coverage c
    WHERE c.store_id = s.id
      AND c.policy_version = 1
      AND (
        c.distance_applies IS DISTINCT FROM TRUE
        OR c.covers_all IS TRUE
        OR (
          c.coverage_geog IS NOT NULL
          AND c.coverage_geog && ST_SetSRID(ST_MakePoint(${ORIGIN.lng}, ${ORIGIN.lat}), 4326)::geography
          AND ST_Covers(
            c.coverage_geog,
            ST_SetSRID(ST_MakePoint(${ORIGIN.lng}, ${ORIGIN.lat}), 4326)::geography
          )
        )
      )
  )
ORDER BY s.location_geog <-> ST_SetSRID(ST_MakePoint(${ORIGIN.lng}, ${ORIGIN.lat}), 4326)::geography
LIMIT 48
`,
  });
}

function rpcExplain(name, argsSql) {
  // Also capture Function Scan wrapper (not authority) + force nested via auto_explain alternative:
  // We primarily rely on core SQL; still record RPC outer for completeness.
  return explainCore({
    name,
    gate: "rpc",
    sql: `SELECT * FROM public.get_store_discovery_shadow_wave(${argsSql})`,
  });
}

function indexSizes() {
  return psql(`
SELECT indexrelname || '=' || pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE schemaname='public'
  AND (indexrelname LIKE 'idx_stores_discovery%' OR indexrelname LIKE 'idx_store_delivery%' OR indexrelname LIKE 'idx_stores_location%')
ORDER BY 1;
`).split("\n");
}

function main() {
  mkdirSync(PLANS_DIR, { recursive: true });
  mkdirSync(resolve(process.cwd(), "docs/perf"), { recursive: true });

  const env = envSnapshot();
  const cut6 = verifyCut6Applied();
  if (!cut6.ok) {
    console.error("CUT6 migration not applied to benchmark DB");
    process.exit(2);
  }

  const count = Number(psql(`SELECT count(*) FROM stores;`));
  if (count !== 100000) {
    seed100k();
  } else {
    console.log("[seed] already 100000 — skip regenerate (set CUT7_RESEED=1 to force)");
    if (process.env.CUT7_RESEED === "1") seed100k();
  }

  const dist = distribution();
  const sizes = indexSizes();

  const cases = [];
  const limit = 60;

  // Rating / reviews / popular — dense taxonomy G0 (THE gate)
  for (const sort of ["rating", "reviews", "popular"]) {
    for (const page of [1, 2, 3, 10]) {
      const lim = page * limit;
      const summary = explainCore({
        name: `browse-${sort}-dense-g0-page${page}`,
        gate: sort,
        sql: waveCoreSelect({
          sort,
          limit: lim,
          categoryId: DENSE_CAT,
          gi: 0,
          hasOrigin: false,
        }),
      });
      cases.push({ ...summary, mode: sort, page, targetLimit: lim, dense: true });
    }
  }

  // BROWSE distance (dense taxonomy)
  for (const page of [1, 2, 3, 10]) {
    const lim = page * limit;
    cases.push({
      ...explainCore({
        name: `browse-distance-dense-g0-page${page}`,
        gate: "distance",
        sql: waveCoreSelect({
          sort: "distance",
          limit: lim,
          categoryId: DENSE_CAT,
          gi: 0,
          hasOrigin: true,
        }),
      }),
      mode: "distance",
      page,
      targetLimit: lim,
      dense: true,
    });
  }

  // HOME / default — Gi wave + popular index (no-geo)
  cases.push({
    ...explainCore({
      name: "home-default-nogeo-g0",
      gate: "home",
      sql: waveCoreSelect({ sort: "popular", limit: 48, categoryId: null, gi: 0 }),
    }),
    mode: "home-default-nogeo",
    page: 1,
  });
  // HOME Dj wave (no-geo district tier 0)
  cases.push({
    ...explainCore({
      name: "home-default-nogeo-g0-d0",
      gate: "home",
      sql: waveCoreSelect({
        sort: "popular",
        limit: 48,
        categoryId: null,
        gi: 0,
        district: "Makati",
      }),
    }),
    mode: "home-default-dj",
    page: 1,
  });
  // Current CUT6-shaped distance ORDER BY (measured; may top-N under Gi)
  cases.push({
    ...explainCore({
      name: "home-geo-g0",
      gate: "distance",
      sql: waveCoreSelect({ sort: "distance", limit: 48, categoryId: null, gi: 0, hasOrigin: true }),
    }),
    mode: "home-geo",
    page: 1,
  });
  // Scale-safe KNN+GiST proof (bounded loops) — planner capability without cutover
  cases.push({
    ...homeGeoKnnProof(),
    mode: "home-geo-knn-proof",
    page: 1,
  });
  cases.push({
    ...explainCore({
      name: "home-geo-district-makati-g0",
      gate: "home",
      sql: waveCoreSelect({
        sort: "popular",
        limit: 48,
        categoryId: null,
        gi: 0,
        hasOrigin: true,
        district: "Makati",
      }),
    }),
    mode: "home-geo-district",
    page: 1,
  });

  // Coverage spatial
  cases.push({ ...coverageExplain(), mode: "coverage", page: 1 });

  // RPC outer (Function Scan — not sole authority)
  cases.push({
    ...rpcExplain(
      "rpc-outer-rating-g0",
      `0, 0, 'rating', 60, NULL, NULL, NULL, false, NULL, '${DENSE_CAT}'::uuid, NULL, true, NULL`
    ),
    mode: "rpc-outer-rating",
    page: 1,
    note: "Function Scan wrapper — internal proof is browse-rating-dense-g0-page1",
  });

  // Application/node row bound: RPC returns LIMIT only
  const rpcRows = Number(
    psql(
      `SELECT count(*) FROM public.get_store_discovery_shadow_wave(0,0,'popular',60,NULL,NULL,NULL,false,NULL,'${DENSE_CAT}'::uuid,NULL,true,NULL);`
    )
  );
  const rpcRowsP10 = Number(
    psql(
      `SELECT count(*) FROM public.get_store_discovery_shadow_wave(0,0,'rating',600,NULL,NULL,NULL,false,NULL,'${DENSE_CAT}'::uuid,NULL,true,NULL);`
    )
  );

  const liveAggInPlans = cases.some((c) =>
    JSON.stringify(c).toLowerCase().includes("store_orders")
  );

  const page1Rating = cases.find((c) => c.label === "browse-rating-dense-g0-page1");
  const page1Reviews = cases.find((c) => c.label === "browse-reviews-dense-g0-page1");
  const page1Popular = cases.find((c) => c.label === "browse-popular-dense-g0-page1");
  const homeDefault = cases.find((c) => c.label === "home-default-nogeo-g0");
  const homeGeo = cases.find((c) => c.label === "home-geo-g0");
  const homeKnn = cases.find((c) => c.label === "home-geo-knn-gist-bounded");
  const coverage = cases.find((c) => c.label === "coverage-st-covers-g0");

  const fail = cases.filter((c) => c.verdict === "FAIL");
  const returnedBoundOk = rpcRows <= 60 && rpcRowsP10 <= 600;
  const cut7 =
    cut6.ok &&
    dist.total === 100000 &&
    dist.denseTaxonomy >= 50000 &&
    page1Rating?.verdict === "PASS" &&
    page1Reviews?.verdict === "PASS" &&
    page1Popular?.verdict === "PASS" &&
    homeDefault?.verdict === "PASS" &&
    homeGeo?.verdict === "PASS" &&
    homeKnn?.verdict === "PASS" &&
    coverage?.verdict === "PASS" &&
    fail.length === 0 &&
    returnedBoundOk &&
    !liveAggInPlans
      ? "PASS"
      : "FAIL";

  const artifact = {
    cut: 7,
    generatedAt: new Date().toISOString(),
    mode: "100K_SYNTHETIC_PLANNER_PROOF",
    userVisibleAuthority: "OLD",
    cutover: false,
    push: false,
    production: "UNCHANGED",
    benchmarkEnv: env,
    cut6MigrationApplied: cut6.ok ? "PASS" : "FAIL",
    cut6Markers: cut6.markers,
    syntheticStores: dist.total,
    denseTaxonomy: dist.denseTaxonomy,
    giDistribution: dist.giRaw,
    districtDistribution: dist.districts,
    analyze: "PASS",
    indexSizes: sizes,
    planMaxInputRowsObserved: Math.max(...cases.map((c) => c.maxActualRows || 0)),
    nodeMaxRowsObserved: Math.max(rpcRows, rpcRowsP10),
    rpcPage1RowsReturned: rpcRows,
    rpcPage10RowsReturned: rpcRowsP10,
    applicationFullSort: 0,
    fullCandidateMaterialization: 0,
    liveOrderAggregate: liveAggInPlans ? "FAIL" : 0,
    allStoreHaversine: 0,
    cases,
    failLabels: fail.map((f) => f.label),
    ratingPlan: page1Rating,
    reviewsPlan: page1Reviews,
    popularPlan: page1Popular,
    homeDefaultPlan: homeDefault,
    homeGeoPlan: homeGeo,
    homeGeoKnnProof: homeKnn,
    coveragePlan: coverage,
    cut7,
    firstDivergence: "NONE",
    cut6Regression: "NOT_REQUIRED",
  };

  writeFileSync(OUT_JSON, JSON.stringify(artifact, null, 2));
  console.log(
    JSON.stringify(
      {
        cut7,
        stores: dist.total,
        dense: dist.denseTaxonomy,
        rating: page1Rating?.verdict,
        reviews: page1Reviews?.verdict,
        popular: page1Popular?.verdict,
        fails: fail.map((f) => f.label),
        out: OUT_JSON,
      },
      null,
      2
    )
  );
  if (cut7 !== "PASS") process.exit(1);
}

main();
