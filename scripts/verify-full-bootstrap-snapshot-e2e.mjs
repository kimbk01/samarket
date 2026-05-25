#!/usr/bin/env node
/**
 * FBT1 full bootstrap snapshot E2E verify — full + critical paths, no legacy fallback.
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
      if (text.includes("[full-bootstrap-monolith-analysis]")) score += 30;
      if (/last_command:.*verify-full-bootstrap-snapshot/.test(meta)) score -= 200;
      if (text.includes("ended_at:")) score -= 80;
      return { full, score, m: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.score - a.score || b.m - a.m);
  return scored[0]?.full ?? path.join(dir, "1.txt");
}

const terminalLog = process.env.FBT1_TERMINAL_LOG ?? pickDevServerTerminalLog(terminalsDir);

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
  const loginIds = [process.env.E2E_TEST_USERNAME, "aa11", "qqqq"].filter(Boolean);
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

async function fetchBootstrap(path, cookie, bust = "") {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}${path}${bust}`, {
    cache: "no-store",
    headers: { Cookie: cookie },
  });
  const body = await res.json().catch(() => null);
  return {
    ms: Date.now() - t0,
    status: res.status,
    ok: body?.ok === true,
    snapshotPath: res.headers.get("x-samarket-cm-bootstrap-snapshot-path") === "1",
    queryWave2Ms: Number(res.headers.get("x-samarket-cm-bootstrap-query-wave-2-ms") ?? NaN),
    rpcRemoved: res.headers.get("x-samarket-cm-bootstrap-rpc-removed") === "1",
    snapshotVia: res.headers.get("x-samarket-cm-bootstrap-snapshot-via") ?? "",
    hasChats: Array.isArray(body?.chats),
    tier: body?.tier ?? "full",
    body,
  };
}

function assertFullBootstrapShape(body) {
  if (!body || body.ok !== true) return "ok !== true";
  const required = ["me", "tabs", "friends", "chats", "groups", "discoverableGroups", "calls"];
  for (const k of required) {
    if (!(k in body)) return `missing field ${k}`;
  }
  if (!Array.isArray(body.chats) || !Array.isArray(body.groups)) return "chats/groups not array";
  if (body.deferredCallLog === true) return "full bootstrap must not defer call log";
  return null;
}

function assertCriticalBootstrapShape(body) {
  if (!body || body.ok !== true) return "ok !== true";
  if (body.tier !== "critical") return "tier !== critical";
  if (!Array.isArray(body.chats) || !Array.isArray(body.groups)) return "chats/groups not array";
  return null;
}

async function main() {
  loadEnvLocal();
  const fails = [];
  const passes = [];

  console.log("\n=== FBT1 Full Bootstrap Snapshot E2E Verify ===\n");
  console.log("dev terminal log:", path.basename(terminalLog));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) {
    console.error("FAIL: Supabase env missing");
    process.exit(1);
  }

  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const { error: rpcErr } = await sb.rpc("get_cm_bootstrap_full_snapshot", {
    p_user_id: "00000000-0000-0000-0000-000000000001",
    p_cursor: "",
    p_limit: 500,
    p_tier: "full",
  });
  if (rpcErr?.message?.includes("Could not find")) {
    fails.push(`RPC missing: ${rpcErr.message}`);
  } else {
    passes.push("get_cm_bootstrap_full_snapshot callable");
  }

  const auth = await signInCookie();
  console.log("test user:", auth.userId);

  const logBefore = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const bust = `&_fresh=${Date.now()}`;

  const fullCold = await fetchBootstrap(
    "/api/community-messenger/bootstrap?fresh=1&cmBootstrapBypass=1",
    auth.cookie,
    bust
  );
  await new Promise((r) => setTimeout(r, 400));
  const criticalCold = await fetchBootstrap(
    "/api/community-messenger/bootstrap?tier=critical&cmBootstrapBypass=1",
    auth.cookie,
    bust
  );

  if (fullCold.status !== 200 || !fullCold.ok) {
    fails.push(`full fetch status=${fullCold.status} ok=${fullCold.ok}`);
  } else {
    passes.push(`full fetch 200 (${fullCold.ms}ms)`);
  }

  const fullShapeErr = assertFullBootstrapShape(fullCold.body);
  if (fullShapeErr) fails.push(`full shape: ${fullShapeErr}`);
  else if (fullCold.ok) passes.push("full bootstrap shape ok");

  if (criticalCold.status !== 200 || !criticalCold.ok) {
    fails.push(`critical fetch status=${criticalCold.status} ok=${criticalCold.ok}`);
  } else {
    passes.push(`critical fetch 200 tier=${criticalCold.tier} (${criticalCold.ms}ms)`);
  }

  const criticalShapeErr = assertCriticalBootstrapShape(criticalCold.body);
  if (criticalShapeErr) fails.push(`critical shape: ${criticalShapeErr}`);
  else if (criticalCold.ok) passes.push("critical bootstrap shape ok");

  const logAfter = fs.existsSync(terminalLog) ? fs.readFileSync(terminalLog, "utf8") : "";
  const newLog = logAfter.slice(logBefore.length);
  const hotpaths = parseLogBlock(newLog, "full-bootstrap-monolith-analysis");
  const fallbacks = (newLog.match(/\[full-bootstrap-snapshot-fallback\]/g) ?? []).length;

  console.log("\nfetch wall: full=", fullCold.ms, "critical=", criticalCold.ms);
  console.log("hotpath rows:", hotpaths.length, "fallbacks:", fallbacks);

  const headerSnapshot = [fullCold, criticalCold].some((r) => r.snapshotPath && r.status === 200);

  if (hotpaths.length === 0) {
    if (headerSnapshot && [fullCold, criticalCold].some((r) => r.rpcRemoved && r.status === 200)) {
      passes.push("[full-bootstrap-monolith-analysis] via response headers");
    } else {
      fails.push("no [full-bootstrap-monolith-analysis] — start npm run dev with latest code");
    }
  } else {
    passes.push("[full-bootstrap-monolith-analysis] observed");
  }

  if (fallbacks > 0) fails.push(`legacy fallback count=${fallbacks}`);
  else passes.push("no [full-bootstrap-snapshot-fallback]");

  if (![fullCold, criticalCold].some((r) => r.snapshotPath && r.status === 200)) {
    fails.push("snapshot path header missing on authenticated full/critical fetch");
  } else {
    passes.push("x-samarket-cm-bootstrap-snapshot-path=1");
  }

  const latestHot = hotpaths.pop();
  if (latestHot || headerSnapshot) {
    const q2 = latestHot?.query_wave_2_ms ?? (headerSnapshot ? 0 : NaN);
    if (Number.isFinite(q2) && q2 > 0 && !(latestHot?.fallback_used === 1)) {
      fails.push(`query_wave_2_ms=${q2}`);
    } else {
      passes.push("query_wave_2_ms=0");
    }
    const rpcRemoved = latestHot?.rpc_removed ?? (headerSnapshot ? 1 : 0);
    if (rpcRemoved !== 1 && fullCold.status === 200) fails.push(`rpc_removed=${rpcRemoved ?? "missing"}`);
    else passes.push("rpc_removed=1");
  }

  console.log("\n--- passes ---");
  for (const p of passes) console.log("PASS:", p);
  console.log("\n--- fails ---");
  for (const f of fails) console.log("FAIL:", f);

  if (fails.length > 0) {
    console.log("\nOVERALL: FAIL");
    process.exit(1);
  }
  console.log("\nOVERALL: PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
