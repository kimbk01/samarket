import fs from "fs";
import path from "path";

export const BASELINE_REL = "scripts/bundle-budget-baseline.json";

export function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export function formatKb(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

export function kbFromBytes(bytes) {
  return Math.round(bytes / 1024);
}

function walkFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(current, e.name);
      if (e.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out;
}

function extractChunkRefsFromClientManifest(absPath) {
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    const out = new Set();
    const re = new RegExp('static/chunks/[^"\'\\s]+\\.js', "g");
    let m;
    while ((m = re.exec(raw))) {
      out.add(m[0].replace(/\\\\/g, "/"));
    }
    return [...out];
  } catch {
    return [];
  }
}

/**
 * @param {string} root repo root
 * @returns {{
 *   totalBytes: number,
 *   entries: { path: string, size: number }[],
 *   messenger: { home: { bytes: number, refsCount: number }, room: { bytes: number, refsCount: number }, call: { bytes: number, refsCount: number } }
 * }}
 */
export function measureBundleMetrics(root) {
  const dist = path.join(root, ".next");
  const chunksDir = path.join(dist, "static", "chunks");
  if (!fs.existsSync(chunksDir)) {
    const err = new Error(`[bundle-budget] .next chunks not found: ${chunksDir}`);
    err.code = "ENOENT_BUILD";
    throw err;
  }

  const files = walkFiles(chunksDir).filter((p) => p.endsWith(".js"));
  const entries = [];
  let totalBytes = 0;
  for (const p of files) {
    let stat;
    try {
      stat = fs.statSync(p);
    } catch {
      continue;
    }
    const size = stat.size || 0;
    totalBytes += size;
    entries.push({ path: path.relative(root, p).replace(/\\/g, "/"), size });
  }
  entries.sort((a, b) => b.size - a.size);

  function sumChunksFromClientManifest(manifestAbsPath) {
    const refs = extractChunkRefsFromClientManifest(manifestAbsPath);
    let bytes = 0;
    for (const ref of refs) {
      const p = `.next/${ref}`;
      const hit = entries.find((e) => e.path === p);
      if (hit) bytes += hit.size;
    }
    return { bytes, refsCount: refs.length };
  }

  const manifestHome = path.join(dist, "server", "app", "(main)", "community-messenger", "page_client-reference-manifest.js");
  const manifestRoom = path.join(dist, "server", "app", "(main)", "community-messenger", "rooms", "[roomId]", "page_client-reference-manifest.js");
  const manifestCall = path.join(dist, "server", "app", "(main)", "community-messenger", "calls", "[sessionId]", "page_client-reference-manifest.js");

  return {
    totalBytes,
    entries,
    messenger: {
      home: sumChunksFromClientManifest(manifestHome),
      room: sumChunksFromClientManifest(manifestRoom),
      call: sumChunksFromClientManifest(manifestCall),
    },
  };
}

/**
 * @param {ReturnType<typeof measureBundleMetrics>} measured
 * @param {number} topN
 */
export function metricsToBaselinePayload(measured, topN = 12) {
  return {
    total_client_js_kb: kbFromBytes(measured.totalBytes),
    messenger_home_js_kb: kbFromBytes(measured.messenger.home.bytes),
    messenger_room_js_kb: kbFromBytes(measured.messenger.room.bytes),
    messenger_call_js_kb: kbFromBytes(measured.messenger.call.bytes),
    top_chunks: measured.entries.slice(0, topN).map((e) => ({
      path: e.path,
      kb: kbFromBytes(e.size),
    })),
  };
}

/**
 * @param {object} baselineFile parsed bundle-budget-baseline.json
 * @param {ReturnType<typeof measureBundleMetrics>} measured
 */
export function evaluateBundleBudgetLock(baselineFile, measured) {
  const metrics = baselineFile.metrics;
  const slack = baselineFile.growth_slack_kb ?? {};
  const failures = [];

  const checks = [
    {
      key: "total_client_js",
      label: "total client js",
      actualKb: kbFromBytes(measured.totalBytes),
      baselineKb: metrics.total_client_js_kb,
      slackKb: slack.total_client_js ?? 500,
    },
    {
      key: "messenger_home_js",
      label: "messenger home js",
      actualKb: kbFromBytes(measured.messenger.home.bytes),
      baselineKb: metrics.messenger_home_js_kb,
      slackKb: slack.messenger_home_js ?? 200,
      refs: measured.messenger.home.refsCount,
    },
    {
      key: "messenger_room_js",
      label: "messenger room js",
      actualKb: kbFromBytes(measured.messenger.room.bytes),
      baselineKb: metrics.messenger_room_js_kb,
      slackKb: slack.messenger_room_js ?? 200,
      refs: measured.messenger.room.refsCount,
    },
    {
      key: "messenger_call_js",
      label: "messenger call js",
      actualKb: kbFromBytes(measured.messenger.call.bytes),
      baselineKb: metrics.messenger_call_js_kb,
      slackKb: slack.messenger_call_js ?? 300,
      refs: measured.messenger.call.refsCount,
    },
  ];

  for (const c of checks) {
    const maxKb = c.baselineKb + c.slackKb;
    const delta = c.actualKb - c.baselineKb;
    const line =
      c.refs != null
        ? `${c.label}: ${c.actualKb} KB (baseline ${c.baselineKb} + slack ${c.slackKb} = max ${maxKb}, refs ${c.refs})`
        : `${c.label}: ${c.actualKb} KB (baseline ${c.baselineKb} + slack ${c.slackKb} = max ${maxKb})`;
    if (c.actualKb > maxKb) {
      failures.push({
        key: c.key,
        message: `${line} — FAIL (+${c.actualKb - maxKb} KB over max)`,
        actualKb: c.actualKb,
        maxKb,
        deltaFromBaseline: delta,
      });
    }
  }

  return { checks, failures };
}

export function loadBaseline(root) {
  const p = path.join(root, BASELINE_REL);
  if (!fs.existsSync(p)) {
    const err = new Error(`[bundle-budget] baseline missing: ${BASELINE_REL}`);
    err.code = "ENOENT_BASELINE";
    throw err;
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
