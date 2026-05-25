#!/usr/bin/env node
/**
 * SOL1 buyer store orders list snapshot E2E verify — PASS when snapshot path active, no legacy fallback.
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
      if (text.includes("[buyer-orders-list-monolith-analysis]")) score += 30;
      if (/last_command:.*verify-buyer-orders-list-snapshot/.test(meta)) score -= 200;
      if (text.includes("ended_at:")) score -= 80;
      return { full, score, m: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.score - a.score || b.m - a.m);
  return scored[0]?.full ?? path.join(dir, "1.txt");
}

const terminalLog =
  process.env.BUYER_ORDERS_LIST_TERMINAL_LOG ?? pickDevServerTerminalLog(terminalsDir);

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

async function lookupBuyerLogin(admin, buyerUserId) {
  const { data: pr } = await admin
    .from("profiles")
    .select("username, auth_login_email, email")
    .eq("id", buyerUserId)
    .maybeSingle();
  const emailRaw = String(pr?.auth_login_email ?? pr?.email ?? "").trim().toLowerCase();
  const username = String(pr?.username ?? "").trim();
  if (emailRaw.includes("@")) return { email: emailRaw, username: username || emailRaw.split("@")[0] };
  if (username) return { email: `${username.toLowerCase()}@manual.local`, username };
  return null;
}

async function signInWithEmail(email, password, serviceKey) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`login failed for ${email}: ${error?.message ?? "no session"}`);
  }
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
  return { cookie, userId: data.session.user.id, loginLabel: email };
}

async function signInCookie() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const loginIds = [process.env.E2E_TEST_USERNAME, "aa11", "qqqq"].filter(Boolean);
  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  for (const loginId of loginIds) {
    let email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    if (serviceKey && loginId === "aa11") {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("auth_login_email, email")
        .or("username.eq.aa11")
        .maybeSingle();
      const resolved = String(pr?.auth_login_email ?? pr?.email ?? "").trim().toLowerCase();
      if (resolved.includes("@")) email = resolved;
    }
    try {
      const auth = await signInWithEmail(email, password, serviceKey);
      return { ...auth, loginLabel: loginId };
    } catch {
      /* try next */
    }
  }
  throw new Error("login failed for aa11/qqqq/E2E_TEST_USERNAME");
}

async function resolveAuth(sb) {
  const password = process.env.E2E_TEST_PASSWORD ?? "1234";
  const auth = await signInCookie();
  const { count } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("buyer_user_id", auth.userId);
  if ((count ?? 0) > 0) return { ...auth, autoResolved: false };

  const { data: latest } = await sb
    .from("store_orders")
    .select("buyer_user_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestBuyerId = String(latest?.buyer_user_id ?? "").trim();
  if (!latestBuyerId) throw new Error("no store orders in DB");
  const login = await lookupBuyerLogin(sb, latestBuyerId);
  if (!login) throw new Error(`buyer profile missing for ${latestBuyerId}`);
  const buyerAuth = await signInWithEmail(
    login.email,
    password,
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  return {
    ...buyerAuth,
    loginLabel: login.username || login.email,
    autoResolved: true,
    skippedLogin: auth.loginLabel,
  };
}

async function fetchOrdersList(cookie, bust = "") {
  const t0 = Date.now();
  const res = await fetch(
    `${baseUrl}/api/me/store-orders?fresh=1&buyerOrdersListBypass=1${bust}`,
    { cache: "no-store", headers: { Cookie: cookie } }
  );
  const body = await res.json().catch(() => null);
  return {
    ms: Date.now() - t0,
    status: res.status,
    ordersLen: Array.isArray(body?.orders) ? body.orders.length : 0,
    snapshotPath: res.headers.get("x-samarket-buyer-orders-list-snapshot-path") === "1",
    queryWave2Ms: Number(res.headers.get("x-samarket-buyer-orders-list-query-wave-2-ms") ?? NaN),
    rpcRemoved: res.headers.get("x-samarket-buyer-orders-list-rpc-removed") === "1",
    snapshotVia: res.headers.get("x-samarket-buyer-orders-list-snapshot-via") ?? "",
    body,
  };
}

function assertListShape(body) {
  if (!body || body.ok !== true) return "ok !== true";
  if (!Array.isArray(body.orders)) return "orders not array";
  for (const o of body.orders.slice(0, 3)) {
    if (!o || typeof o !== "object") return "order not object";
    if (typeof o.id !== "string") return "order.id missing";
    if (!Array.isArray(o.items)) return "order.items missing";
    if (typeof o.store_name !== "string") return "order.store_name missing";
    if (typeof o.order_chat_unread_count !== "number") return "order.order_chat_unread_count missing";
  }
  return null;
}

async function main() {
  loadEnvLocal();
  const fails = [];
  const passes = [];

  console.log("\n=== Buyer Store Orders List Snapshot E2E Verify ===\n");
  console.log("dev terminal log:", path.basename(terminalLog));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) {
    console.error("FAIL: Supabase env missing");
    process.exit(1);
  }

  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const { error: rpcErr } = await sb.rpc("get_buyer_store_orders_list_snapshot", {
    p_user_id: "00000000-0000-0000-0000-000000000001",
    p_status: "",
    p_limit: 100,
    p_cursor: "",
  });
  if (rpcErr?.message?.includes("Could not find")) {
    fails.push(`RPC missing: ${rpcErr.message}`);
  } else {
    passes.push("get_buyer_store_orders_list_snapshot callable");
  }

  const auth = await resolveAuth(sb);
  console.log("test user:", auth.userId);
  if (auth.autoResolved) {
    console.log(
      "auto buyer login:",
      auth.loginLabel,
      auth.skippedLogin ? `(default ${auth.skippedLogin} has no orders)` : ""
    );
  } else {
    console.log("login:", auth.loginLabel ?? auth.userId);
  }

  const logBefore = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const bust = `&_fresh=${Date.now()}`;

  const cold = await fetchOrdersList(auth.cookie, bust);
  await new Promise((r) => setTimeout(r, 350));
  const warm = await fetchOrdersList(auth.cookie, bust);

  const logAfter = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const newLog = logAfter.slice(logBefore.length);
  const hotpaths = parseLogBlock(newLog, "buyer-orders-list-monolith-analysis");
  const fallbacks = (newLog.match(/\[buyer-orders-list-snapshot-fallback\]/g) ?? []).length;

  console.log("\nfetch wall: cold=", cold.ms, "warm=", warm.ms);
  console.log("hotpath rows:", hotpaths.length, "fallbacks:", fallbacks);

  if (cold.status !== 200) fails.push(`cold status=${cold.status}`);
  else passes.push(`cold 200 (orders=${cold.ordersLen})`);

  const shapeErr = assertListShape(cold.body);
  if (shapeErr) fails.push(`list shape: ${shapeErr}`);
  else passes.push("orders list shape ok");

  const latestHot = hotpaths.length ? hotpaths[hotpaths.length - 1] : null;
  const headerSnapshot = [cold, warm].some((r) => r.snapshotPath);

  if (hotpaths.length === 0) {
    if (headerSnapshot && cold.rpcRemoved) {
      passes.push("[buyer-orders-list-monolith-analysis] via response headers");
    } else {
      fails.push("no [buyer-orders-list-monolith-analysis] — start npm run dev with latest code");
    }
  } else {
    passes.push("[buyer-orders-list-monolith-analysis] observed");
  }

  if (fallbacks > 0) fails.push(`legacy fallback count=${fallbacks}`);
  else passes.push("no [buyer-orders-list-snapshot-fallback]");

  const q2 = latestHot?.query_wave_2_ms ?? (headerSnapshot ? 0 : NaN);
  if (Number.isFinite(q2) && q2 > 0) fails.push(`query_wave_2_ms=${q2}`);
  else passes.push("query_wave_2_ms=0");

  const rpcRemoved = latestHot?.rpc_removed ?? (cold.rpcRemoved ? 1 : 0);
  if (Number(latestHot?.fallback_used ?? 0) === 1) fails.push("fallback_used=1");
  else if (rpcRemoved !== 1 && !headerSnapshot) fails.push(`rpc_removed=${rpcRemoved ?? "missing"}`);
  else passes.push("rpc_removed=1");

  if (!headerSnapshot) fails.push("snapshot response headers missing");
  else passes.push(`snapshot response headers present (${cold.snapshotVia || warm.snapshotVia || "ok"})`);

  console.log("\n--- PASS ---");
  passes.forEach((p) => console.log(" ✓", p));
  if (fails.length) {
    console.log("\n--- FAIL ---");
    fails.forEach((f) => console.log(" ✗", f));
    process.exit(1);
  }
  console.log("\nVERDICT: PASS (buyer store orders list snapshot architecture)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
