#!/usr/bin/env node
/**
 * POST /api/trade/chat/entry/resolve 벽시계 3회 (Supabase 쿠키).
 * 사용: npm run dev && node scripts/measure-trade-entry-resolve.mjs [postId]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
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

async function signInCookieHeader() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 필요");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const password = process.env.E2E_TEST_PASSWORD ?? process.env.SAMARKET_TEST_PASSWORD ?? "1234";
  const email = "qqqq@manual.local";
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message ?? "signIn failed");
  const session = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  });
  const parts = [`sb-${ref}-auth-token=${encodeURIComponent(session)}`];
  if (serviceKey) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", data.session.user.id)
      .maybeSingle();
    const activeSession = String(pr?.active_session_id ?? "").trim();
    if (activeSession) {
      parts.push(`samarket_active_session_id=${encodeURIComponent(activeSession)}`);
    }
  }
  return parts.join("; ");
}

async function pickPostId(cookie) {
  const htmlRes = await fetch(`${baseUrl}/market`, {
    headers: { cookie, accept: "text/html" },
    cache: "no-store",
  });
  const html = await htmlRes.text();
  const m = html.match(/href="\/post\/([a-f0-9-]{36})"/i) ?? html.match(/href='\/post\/([a-f0-9-]{36})'/i);
  if (m?.[1]) return m[1];
  throw new Error("/market HTML 에서 postId 를 찾지 못함");
}

async function resolveOnce(cookie, productId) {
  const t0 = performance.now();
  const res = await fetch(`${baseUrl}/api/trade/chat/entry/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ productId }),
  });
  const wallMs = Math.round(performance.now() - t0);
  const body = await res.json().catch(() => ({}));
  return { wallMs, status: res.status, ok: body?.ok, roomId: body?.roomId, messengerRoomId: body?.messengerRoomId };
}

async function main() {
  const cookie = await signInCookieHeader();
  const productId = process.argv[2]?.trim() || (await pickPostId(cookie));
  console.log(`[resolve] productId=${productId}`);
  const runs = Math.max(3, Number(process.env.RESOLVE_MEASURE_RUNS ?? 7) || 7);
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const row = await resolveOnce(cookie, productId);
    samples.push(row);
    console.log(`  #${i + 1} wall_ms=${row.wallMs} status=${row.status} ok=${row.ok}`);
    await new Promise((r) => setTimeout(r, 350));
  }
  const sorted = [...samples.map((s) => s.wallMs)].sort((a, b) => a - b);
  const p50 = sorted[Math.floor((sorted.length - 1) / 2)] ?? sorted[0];
  const p95Idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  const p95 = sorted[p95Idx];
  console.log("\n=== RESOLVE_WALL_MS ===", { p50, p95, runs: sorted.length, samples: sorted, productId });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
