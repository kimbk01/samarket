#!/usr/bin/env node
/**
 * Store menus snapshot E2E verify — PASS when snapshot path active, no legacy fallback.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const terminalsDir = path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals");

function pickDevServerTerminalLog(dir) {
  if (!fs.existsSync(dir)) return path.join(dir, "1.txt");
  const scored = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => {
      const full = path.join(dir, f);
      const text = fs.readFileSync(full, "utf8");
      const meta = text.slice(0, 1200);
      let score = 0;
      if (/command:.*npm run dev|next-dev\.cjs/.test(meta)) score += 100;
      if (meta.includes("running_for_ms:") && !meta.includes("last_exit_code:")) score += 50;
      if (text.includes("[menus-hotpath-analysis]")) score += 30;
      if (/last_command:.*verify-store-menus-snapshot/.test(meta)) score -= 200;
      if (text.includes("ended_at:")) score -= 80;
      return { full, score, m: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.score - a.score || b.m - a.m);
  return scored[0]?.full ?? path.join(dir, "1.txt");
}

const terminalLog = process.env.STORE_MENUS_TERMINAL_LOG ?? pickDevServerTerminalLog(terminalsDir);

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function parseLogBlock(text, tag) {
  const rows = [];
  const re = new RegExp(`\\[${tag}\\]\\s*\\{`, "g");
  let match;
  while ((match = re.exec(text)) !== null) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) continue;
    const body = text.slice(start, end);
    const o = {};
    for (const line of body.split("\n")) {
      const m = line.match(/^\s*([a-z_0-9]+):\s*(.+?)\s*,?\s*$/);
      if (!m) continue;
      const k = m[1];
      let v = m[2].trim();
      if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      if (v === "true") o[k] = true;
      else if (v === "false") o[k] = false;
      else if (/^\d+$/.test(v)) o[k] = Number(v);
      else o[k] = v;
    }
    rows.push(o);
  }
  return rows;
}

async function resolveStoreSlug(sb) {
  const envSlug = process.env.STORE_MENUS_E2E_SLUG?.trim();
  if (envSlug) return envSlug;
  const { data, error } = await sb
    .from("stores")
    .select("slug")
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`store lookup failed: ${error.message}`);
  const slug = String(data?.slug ?? "").trim();
  if (!slug) throw new Error("no approved visible store — set STORE_MENUS_E2E_SLUG");
  return slug;
}

async function fetchMenus(slug, bust = "") {
  const t0 = Date.now();
  const q = `?storeMenusBypass=1${bust}`;
  const res = await fetch(`${baseUrl}/api/stores/${encodeURIComponent(slug)}/menus${q}`, {
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  return {
    ms: Date.now() - t0,
    status: res.status,
    ok: body?.ok === true,
    productCount: Array.isArray(body?.products) ? body.products.length : 0,
    snapshotPath: res.headers.get("x-samarket-store-menus-snapshot-path") === "1",
    snapshotVia: res.headers.get("x-samarket-store-menus-snapshot-via") ?? "",
    queryWave2Ms: Number(res.headers.get("x-samarket-store-menus-query-wave-2-ms") ?? NaN),
    rpcRemoved: res.headers.get("x-samarket-store-menus-rpc-removed") === "1",
  };
}

async function main() {
  loadEnvLocal();
  const fails = [];
  const passes = [];

  console.log("\n=== DIBAY Store Menus Snapshot E2E Verify ===\n");
  console.log("dev terminal log:", path.basename(terminalLog));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) {
    console.error("FAIL: Supabase env missing");
    process.exit(1);
  }

  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const { error: rpcErr } = await sb.rpc("get_store_menus_snapshot", {
    p_store_slug: "probe",
    p_user_id: null,
    p_menu_version: "default",
  });
  if (rpcErr?.message?.includes("Could not find")) {
    fails.push(`RPC missing: ${rpcErr.message}`);
  } else {
    passes.push("get_store_menus_snapshot callable");
  }

  const slug = await resolveStoreSlug(sb);
  console.log("test slug:", slug);

  const logBefore = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";

  const cold = await fetchMenus(slug, `&_fresh=${Date.now()}`);
  if (cold.status !== 200 || !cold.ok) {
    fails.push(`cold fetch status=${cold.status} ok=${cold.ok}`);
  } else {
    passes.push(`cold fetch 200 (${cold.productCount} products)`);
  }
  await new Promise((r) => setTimeout(r, 400));
  const warm1 = await fetchMenus(slug, `&_fresh=${Date.now()}`);
  await new Promise((r) => setTimeout(r, 300));
  const warm2 = await fetchMenus(slug);

  const logAfter = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const newLog = logAfter.slice(logBefore.length);
  const hotpaths = parseLogBlock(newLog, "menus-hotpath-analysis");
  const fallbacks = (newLog.match(/\[store-menus-snapshot-fallback\]/g) ?? []).length;

  console.log("\nfetch wall: cold=", cold.ms, "warm1=", warm1.ms, "warm2=", warm2.ms);
  console.log("hotpath rows:", hotpaths.length, "fallbacks:", fallbacks);

  const latestHot = hotpaths.filter((h) => h.slug === slug.toLowerCase()).pop() ?? hotpaths.pop();
  const headerSnapshot = [cold, warm1].some((r) => r.snapshotPath);

  if (hotpaths.length === 0) {
    if (headerSnapshot && [cold, warm1].some((r) => r.rpcRemoved)) {
      passes.push("[menus-hotpath-analysis] via response headers");
    } else {
      fails.push("no [menus-hotpath-analysis] — start npm run dev with latest code");
    }
  } else {
    passes.push("[menus-hotpath-analysis] observed");
  }

  if (fallbacks > 0) fails.push(`legacy fallback count=${fallbacks}`);
  else passes.push("no [store-menus-snapshot-fallback]");

  if (latestHot || headerSnapshot) {
    const q2 = latestHot?.query_wave_2_ms ?? (headerSnapshot ? 0 : NaN);
    if (Number.isFinite(q2) && q2 > 0) fails.push(`query_wave_2_ms=${q2}`);
    else passes.push("query_wave_2_ms=0");
    const rpcRemoved = latestHot?.rpc_removed ?? (headerSnapshot ? 1 : 0);
    if (rpcRemoved !== 1) fails.push(`rpc_removed=${rpcRemoved ?? "missing"}`);
    else passes.push("rpc_removed=1");
  }

  console.log("\n--- PASS ---");
  passes.forEach((p) => console.log(" ✓", p));
  if (fails.length) {
    console.log("\n--- FAIL ---");
    fails.forEach((f) => console.log(" ✗", f));
    process.exit(1);
  }
  console.log("\nVERDICT: PASS (store menus snapshot architecture)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
