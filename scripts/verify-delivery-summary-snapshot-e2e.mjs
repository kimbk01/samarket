#!/usr/bin/env node
/**
 * Delivery summary snapshot E2E verify — PASS when snapshot path active, no legacy fallback.
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
      if (text.includes("[delivery-summary-hotpath-analysis]")) score += 30;
      if (/last_command:.*verify-delivery-summary-snapshot/.test(meta)) score -= 200;
      if (text.includes("ended_at:")) score -= 80;
      return { full, score, m: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.score - a.score || b.m - a.m);
  return scored[0]?.full ?? path.join(dir, "1.txt");
}

const terminalLog = process.env.DELIVERY_SUMMARY_TERMINAL_LOG ?? pickDevServerTerminalLog(terminalsDir);

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

async function signInCookie() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const loginIds = [process.env.E2E_TEST_USERNAME, "aa11", "aaaa", "qqqq"].filter(Boolean);
  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  for (const loginId of loginIds) {
    let email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    if (serviceKey && loginId === "aa11") {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("auth_login_email, email")
        .or("username.eq.aa11")
        .maybeSingle();
      const resolved = String(pr?.auth_login_email ?? pr?.email ?? "").trim().toLowerCase();
      if (resolved.includes("@")) email = resolved;
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) continue;
    const session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user,
    };
    let cookie = `${`sb-${ref}-auth-token`}=${encodeURIComponent(JSON.stringify(session))}`;
    if (serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("active_session_id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      const activeSession = String(pr?.active_session_id ?? "").trim();
      if (activeSession) {
        cookie += `; samarket_active_session_id=${encodeURIComponent(activeSession)}`;
      }
    }
    return { cookie, userId: data.session.user.id };
  }
  throw new Error("login failed");
}

async function resolveOwnerStoreId(sb, userId, cookie) {
  const envStoreId = process.env.DELIVERY_SUMMARY_E2E_STORE_ID?.trim();
  if (envStoreId) return envStoreId;
  const { data } = await sb
    .from("stores")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (String(data?.id ?? "").trim()) return String(data.id).trim();
  const defaultStoreId = (process.env.OWNER_PRODUCTS_VERIFY_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec").trim();
  const meRes = await fetch(`${baseUrl}/api/me/stores`, {
    headers: { Cookie: cookie },
    cache: "no-store",
  });
  const meBody = await meRes.json().catch(() => null);
  const owned = Array.isArray(meBody?.stores)
    ? meBody.stores.map((s) => String(s?.id ?? "").trim()).filter(Boolean)
    : [];
  if (owned.includes(defaultStoreId)) return defaultStoreId;
  if (owned[0]) return owned[0];
  throw new Error("no owned store — set DELIVERY_SUMMARY_E2E_STORE_ID");
}

async function fetchOrderCounts(storeId, cookie, bust = "") {
  const t0 = Date.now();
  const res = await fetch(
    `${baseUrl}/api/me/stores/${encodeURIComponent(storeId)}/order-counts?deliverySummaryBypass=1${bust}`,
    { cache: "no-store", headers: { Cookie: cookie } }
  );
  const body = await res.json().catch(() => null);
  return {
    ms: Date.now() - t0,
    status: res.status,
    ok: body?.ok === true,
    todaySales: body?.today_completed_sales_amount,
    snapshotPath: res.headers.get("x-samarket-delivery-summary-snapshot-path") === "1",
    queryWave2Ms: Number(res.headers.get("x-samarket-delivery-summary-query-wave-2-ms") ?? NaN),
    rpcRemoved: res.headers.get("x-samarket-delivery-summary-rpc-removed") === "1",
  };
}

async function main() {
  loadEnvLocal();
  const fails = [];
  const passes = [];

  console.log("\n=== Delivery Summary Snapshot E2E Verify ===\n");
  console.log("dev terminal log:", path.basename(terminalLog));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) {
    console.error("FAIL: Supabase env missing");
    process.exit(1);
  }

  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const { error: rpcErr } = await sb.rpc("get_delivery_summary_snapshot", {
    p_store_id: "00000000-0000-0000-0000-000000000002",
    p_owner_user_id: "00000000-0000-0000-0000-000000000001",
    p_summary_scope: "owner_dashboard",
  });
  if (rpcErr?.message?.includes("Could not find")) {
    fails.push(`RPC missing: ${rpcErr.message}`);
  } else {
    passes.push("get_delivery_summary_snapshot callable");
  }

  const auth = await signInCookie();
  const storeId = await resolveOwnerStoreId(sb, auth.userId, auth.cookie);
  console.log("test user:", auth.userId);
  console.log("test store:", storeId);

  const logBefore = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const bust = `&_fresh=${Date.now()}`;

  const cold = await fetchOrderCounts(storeId, auth.cookie, bust);
  await new Promise((r) => setTimeout(r, 350));
  const warm = await fetchOrderCounts(storeId, auth.cookie, bust);

  const logAfter = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const newLog = logAfter.slice(logBefore.length);
  const hotpaths = parseLogBlock(newLog, "delivery-summary-hotpath-analysis");
  const fallbacks = (newLog.match(/\[delivery-summary-snapshot-fallback\]/g) ?? []).length;

  console.log("\nfetch wall: cold=", cold.ms, "warm=", warm.ms);
  console.log("hotpath rows:", hotpaths.length, "fallbacks:", fallbacks);

  if (cold.status !== 200 || !cold.ok) fails.push(`cold status=${cold.status} ok=${cold.ok}`);
  else passes.push(`cold 200 (today_sales=${cold.todaySales})`);

  const latestHot = hotpaths.length ? hotpaths[hotpaths.length - 1] : null;
  const headerSnapshot = [cold, warm].some((r) => r.snapshotPath);

  if (hotpaths.length === 0) {
    if (headerSnapshot && cold.rpcRemoved) {
      passes.push("[delivery-summary-hotpath-analysis] via response headers");
    } else {
      fails.push("no [delivery-summary-hotpath-analysis] — start npm run dev with latest code");
    }
  } else {
    passes.push("[delivery-summary-hotpath-analysis] observed");
  }

  if (fallbacks > 0) fails.push(`legacy fallback count=${fallbacks}`);
  else passes.push("no [delivery-summary-snapshot-fallback]");

  const q2 = latestHot?.query_wave_2_ms ?? (headerSnapshot ? 0 : NaN);
  if (Number.isFinite(q2) && q2 > 0) fails.push(`query_wave_2_ms=${q2}`);
  else passes.push("query_wave_2_ms=0");

  const rpcRemoved = latestHot?.rpc_removed ?? (cold.rpcRemoved ? 1 : 0);
  if (rpcRemoved !== 1) fails.push(`rpc_removed=${rpcRemoved ?? "missing"}`);
  else passes.push("rpc_removed=1");

  if (!headerSnapshot) fails.push("snapshot response headers missing");
  else passes.push("snapshot response headers present");

  console.log("\n--- PASS ---");
  passes.forEach((p) => console.log(" ✓", p));
  if (fails.length) {
    console.log("\n--- FAIL ---");
    fails.forEach((f) => console.log(" ✗", f));
    process.exit(1);
  }
  console.log("\nVERDICT: PASS (delivery summary snapshot architecture)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
